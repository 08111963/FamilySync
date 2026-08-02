import fs from "fs/promises";
import { db } from "../db";
import { chatMessages, users, billAttachments } from "../../shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { isObjectStorageMode, objectKeyFromUrl, uploadObjectExists } from "./upload-storage";
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

export interface UploadIntegrityReport {
  checked: number;
  orphans: OrphanRecord[];
  autoClean: boolean;
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

  for (const { source, rows } of targets) {
    for (const row of rows) {
      if (!row.fileUrl) continue;
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

  if (orphans.length > 0) {
    try {
      await sendUploadIntegrityAlertEmail({ checked, orphans, autoClean });
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
    });
  }

  return { checked, orphans, autoClean };
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
