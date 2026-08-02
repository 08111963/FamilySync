import fs from "fs/promises";
import { db } from "../db";
import { chatMessages, users, billAttachments } from "../../shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import {
  deleteStoredUploads,
  isObjectStorageMode,
  listUploadObjects,
  objectKeyFromUrl,
  uploadObjectExists,
} from "./upload-storage";
import { resolveSafeUploadPath } from "./uploads-cleanup";
import { sendUploadIntegrityAlertEmail } from "./email";

/**
 * Scansione periodica di integrità degli allegati /uploads/*:
 * verifica che ogni file_url/avatar_url memorizzato nel DB corrisponda a un
 * file realmente esistente (bucket Object Storage e/o disco locale) e segnala
 * le righe orfane PRIMA che gli utenti vedano allegati rotti.
 *
 * Comportamento:
 * - orfani sempre loggati in modo strutturato (tag UPLOAD_INTEGRITY) e
 *   riepilogati via email al proprietario (APP_OWNER_EMAILS, se configurata);
 * - auto-cleanup OPZIONALE via env UPLOAD_INTEGRITY_AUTO_CLEAN=true:
 *   azzera file_url/avatar_url (chat/utenti) o elimina la riga
 *   (bill_attachments, dove file_url è NOT NULL). Default: solo segnalazione.
 * - fail-closed sugli errori di comunicazione col bucket: la scansione si
 *   interrompe SENZA marcare nulla come orfano (niente falsi positivi che
 *   potrebbero portare a cancellazioni sbagliate).
 */

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // una volta al giorno
const FIRST_RUN_DELAY_MS = 60 * 1000;

export function isAutoCleanEnabled(): boolean {
  return (process.env.UPLOAD_INTEGRITY_AUTO_CLEAN || "").trim().toLowerCase() === "true";
}

export interface OrphanRecord {
  source: "chat_messages" | "users" | "bill_attachments";
  rowId: string;
  fileUrl: string;
  /** "missing" = file assente ovunque; "invalid" = URL malformato/traversal. */
  reason: "missing" | "invalid";
  cleaned: boolean;
}

/** File nel bucket sotto uploads/* che nessuna riga del DB referenzia più. */
export interface ForgottenFileRecord {
  /** Chiave oggetto nel bucket (es. "uploads/abc.jpg"). */
  key: string;
  deleted: boolean;
}

export interface UploadIntegrityReport {
  checked: number;
  orphans: OrphanRecord[];
  /** Oggetti bucket esaminati nella direzione bucket→DB (0 in modalità local). */
  bucketChecked: number;
  forgotten: ForgottenFileRecord[];
  autoClean: boolean;
}

// ---------------------------------------------------------------------------
// Direzione inversa (bucket→DB): file sotto uploads/* che nessuna riga
// referenzia più (es. delete DB riuscita ma delete bucket fallita).
// ---------------------------------------------------------------------------

// Il prefisso della cache foto ricette è ESCLUSO: è una cache pubblica
// cross-family per titolo, gestita a parte (non appartiene a nessuna riga).
const EXCLUDED_KEY_PREFIXES = ["uploads/recipe-images/"];

// Periodo di grazia per i file appena caricati non ancora salvati nel DB
// (upload multer -> bucket -> INSERT riga: la scansione può passare in mezzo).
// Il client bucket non espone il timestamp degli oggetti, quindi la grazia è
// implementata "a doppia vista": un oggetto non referenziato viene ricordato
// in memoria alla prima vista e segnalato solo se risulta ANCORA non
// referenziato dopo il periodo di grazia. Un riavvio azzera la memoria: il
// peggio che può succedere è una segnalazione ritardata, mai prematura.
const DEFAULT_GRACE_MS = 6 * 60 * 60 * 1000; // 6 ore

function graceMs(): number {
  const raw = Number(process.env.UPLOAD_INTEGRITY_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_MS;
}

/** key -> timestamp (ms) della prima vista come non referenziato. */
const unreferencedFirstSeen = new Map<string, number>();

/** SOLO PER TEST: azzera lo stato del periodo di grazia. */
export function __resetForgottenTrackingForTests(): void {
  unreferencedFirstSeen.clear();
}

/**
 * Verifica se il file di un fileUrl memorizzato esiste davvero.
 * - URL esterni (http/https, es. avatar Google) sono sempre considerati validi:
 *   non sono nostri file e non vanno mai toccati.
 * - "invalid": URL che non è un percorso /uploads sicuro (traversal, caratteri
 *   fuori allowlist) — non potrà MAI essere servito, quindi è rotto per definizione.
 * - "missing": assente sia nel bucket (se attivo) sia sul disco locale
 *   (il serving fa fallback allo static locale per i file legacy).
 * Lancia sugli errori di comunicazione col bucket (fail-closed).
 */
export async function checkStoredUpload(
  fileUrl: string
): Promise<"ok" | "missing" | "invalid"> {
  if (/^https?:\/\//i.test(fileUrl)) return "ok";

  const key = objectKeyFromUrl(fileUrl);
  if (!key) return "invalid";

  if (isObjectStorageMode()) {
    // Lancia in caso di errore bucket: il chiamante interrompe la scansione.
    if (await uploadObjectExists(fileUrl)) return "ok";
  }

  const localPath = resolveSafeUploadPath(fileUrl);
  if (localPath) {
    try {
      await fs.access(localPath);
      return "ok";
    } catch {
      /* non presente su disco */
    }
  }
  return "missing";
}

async function cleanupOrphan(orphan: OrphanRecord): Promise<boolean> {
  try {
    if (orphan.source === "chat_messages") {
      // Azzera solo il file_url (preserva il messaggio); guardia sul valore
      // corrente per non toccare righe modificate nel frattempo.
      await db
        .update(chatMessages)
        .set({ fileUrl: null })
        .where(and(eq(chatMessages.id, orphan.rowId), eq(chatMessages.fileUrl, orphan.fileUrl)));
    } else if (orphan.source === "users") {
      await db
        .update(users)
        .set({ avatarUrl: null })
        .where(and(eq(users.id, orphan.rowId), eq(users.avatarUrl, orphan.fileUrl)));
    } else {
      // bill_attachments: file_url è NOT NULL, la riga senza file non ha senso.
      await db
        .delete(billAttachments)
        .where(and(eq(billAttachments.id, orphan.rowId), eq(billAttachments.fileUrl, orphan.fileUrl)));
    }
    return true;
  } catch (err) {
    logger.error("Upload integrity cleanup failed", {
      tag: "UPLOAD_INTEGRITY",
      source: orphan.source,
      rowId: orphan.rowId,
      error: String(err),
    });
    return false;
  }
}

/**
 * Direzione bucket→DB: confronta gli oggetti uploads/* del bucket con le
 * chiavi referenziate dal DB e segnala (o elimina, con auto-clean) i file
 * "dimenticati". Lancia se il list del bucket fallisce (fail-closed).
 */
async function scanForgottenBucketFiles(
  referencedKeys: Set<string>,
  autoClean: boolean
): Promise<{ bucketChecked: number; forgotten: ForgottenFileRecord[] }> {
  const forgotten: ForgottenFileRecord[] = [];
  if (!isObjectStorageMode()) return { bucketChecked: 0, forgotten };

  const keys = await listUploadObjects();
  const now = Date.now();
  const grace = graceMs();
  const stillUnreferenced = new Set<string>();

  for (const key of keys) {
    if (EXCLUDED_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (referencedKeys.has(key)) continue;

    stillUnreferenced.add(key);
    const firstSeen = unreferencedFirstSeen.get(key);
    if (firstSeen === undefined) {
      // Prima vista: potrebbe essere un upload in corso non ancora nel DB.
      unreferencedFirstSeen.set(key, now);
      continue;
    }
    if (now - firstSeen < grace) continue;

    const record: ForgottenFileRecord = { key, deleted: false };
    if (autoClean) {
      const result = await deleteStoredUploads([`/${key}`]);
      record.deleted = result.failed === 0;
      if (record.deleted) {
        stillUnreferenced.delete(key);
      }
    }
    forgotten.push(record);

    logger.warn("File bucket dimenticato rilevato", {
      tag: "UPLOAD_INTEGRITY",
      key: record.key,
      deleted: record.deleted,
    });
  }

  // Dimentica le chiavi tornate referenziate/sparite: la mappa resta piccola.
  for (const key of Array.from(unreferencedFirstSeen.keys())) {
    if (!stillUnreferenced.has(key)) unreferencedFirstSeen.delete(key);
  }

  return { bucketChecked: keys.length, forgotten };
}

/**
 * Un singolo passaggio di scansione (esportato per i test).
 * Ritorna il report; lancia se il bucket non è raggiungibile.
 */
export async function runUploadIntegrityScanOnce(): Promise<UploadIntegrityReport> {
  const autoClean = isAutoCleanEnabled();
  const orphans: OrphanRecord[] = [];
  let checked = 0;

  const targets: Array<{
    source: OrphanRecord["source"];
    rows: Array<{ id: string; fileUrl: string | null }>;
  }> = [
    {
      source: "chat_messages",
      rows: await db
        .select({ id: chatMessages.id, fileUrl: chatMessages.fileUrl })
        .from(chatMessages)
        .where(isNotNull(chatMessages.fileUrl)),
    },
    {
      source: "users",
      rows: await db
        .select({ id: users.id, fileUrl: users.avatarUrl })
        .from(users)
        .where(isNotNull(users.avatarUrl)),
    },
    {
      source: "bill_attachments",
      rows: await db
        .select({ id: billAttachments.id, fileUrl: billAttachments.fileUrl })
        .from(billAttachments),
    },
  ];

  // Chiavi bucket referenziate da ALMENO una riga (per la direzione inversa).
  // Include anche le righe "invalid"/orfane: la direzione inversa non deve
  // eliminare file che una riga referenzia ancora, anche se rotta.
  const referencedKeys = new Set<string>();

  for (const { source, rows } of targets) {
    for (const row of rows) {
      if (!row.fileUrl) continue;
      const refKey = objectKeyFromUrl(row.fileUrl);
      if (refKey) referencedKeys.add(refKey);
      checked++;
      const status = await checkStoredUpload(row.fileUrl);
      if (status === "ok") continue;

      const orphan: OrphanRecord = {
        source,
        rowId: row.id,
        fileUrl: row.fileUrl,
        reason: status,
        cleaned: false,
      };
      if (autoClean) {
        orphan.cleaned = await cleanupOrphan(orphan);
      }
      orphans.push(orphan);

      logger.warn("Upload orfano rilevato", {
        tag: "UPLOAD_INTEGRITY",
        source: orphan.source,
        rowId: orphan.rowId,
        fileUrl: orphan.fileUrl,
        reason: orphan.reason,
        cleaned: orphan.cleaned,
      });
    }
  }

  // Direzione inversa bucket→DB. Lancia se il list fallisce (fail-closed):
  // meglio nessun report che segnalare "dimenticati" file solo perché la
  // lista è arrivata incompleta.
  const { bucketChecked, forgotten } = await scanForgottenBucketFiles(referencedKeys, autoClean);

  if (orphans.length > 0 || forgotten.length > 0) {
    try {
      await sendUploadIntegrityAlertEmail({ checked, orphans, bucketChecked, forgotten, autoClean });
    } catch (err) {
      // L'alert email è best-effort: gli orfani restano comunque nei log.
      logger.error("Upload integrity alert email failed", {
        tag: "UPLOAD_INTEGRITY",
        error: String(err),
      });
    }
  } else {
    logger.info("Upload integrity scan: nessun orfano", {
      tag: "UPLOAD_INTEGRITY",
      checked,
      bucketChecked,
    });
  }

  return { checked, orphans, bucketChecked, forgotten, autoClean };
}

/**
 * Avvia lo scheduler: primo giro poco dopo l'avvio, poi una volta al giorno.
 * Idempotente rispetto a più istanze: la scansione è read-only (o azzera con
 * guardia sul valore corrente), quindi due giri concorrenti sono innocui.
 */
export function startUploadIntegrityScheduler(): void {
  const run = () => {
    runUploadIntegrityScanOnce().catch((err) =>
      logger.error("Upload integrity scan error", {
        tag: "UPLOAD_INTEGRITY",
        error: String(err),
      })
    );
  };
  setTimeout(run, FIRST_RUN_DELAY_MS);
  const timer = setInterval(run, CHECK_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}
