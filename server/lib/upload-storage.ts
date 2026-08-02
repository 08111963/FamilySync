import fs from "fs/promises";
import path from "path";
import type { Request, Response, NextFunction } from "express";
import { Client } from "@replit/object-storage";
import { logger } from "./logger";
import { deleteUploadFiles, uploadsDir, type FileCleanupResult } from "./uploads-cleanup";

/**
 * Storage astratto per gli upload utente (/uploads/*): allegati bollette,
 * file chat, avatar.
 *
 * Modalità (env STORAGE_MODE):
 * - assente o "local"        -> disco locale (solo sviluppo; in produzione è
 *                               fragile su autoscale: il disco NON è persistente)
 * - "object-storage"         -> Replit App/Object Storage (bucket persistente)
 *
 * Valori sconosciuti fanno fallire l'avvio (fail-closed): meglio un errore
 * esplicito che upload silenziosamente volatili.
 */

const RAW_MODE = (process.env.STORAGE_MODE || "local").trim().toLowerCase();

if (RAW_MODE !== "local" && RAW_MODE !== "object-storage") {
  throw new Error(
    `STORAGE_MODE non valido: "${process.env.STORAGE_MODE}". Valori ammessi: "local", "object-storage".`
  );
}

export const storageMode: "local" | "object-storage" = RAW_MODE as
  | "local"
  | "object-storage";

export function isObjectStorageMode(): boolean {
  return storageMode === "object-storage";
}

let client: Client | null = null;

/**
 * SOLO PER TEST: inietta un client fittizio (bucket in-memory) al posto del
 * Client Replit reale. Non usare mai in codice di produzione.
 */
export function __setObjectStorageClientForTests(fake: unknown): void {
  client = fake as Client;
}

function getClient(): Client {
  if (!client) {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    // Se DEFAULT_OBJECT_STORAGE_BUCKET_ID non è impostato, il Client prova a
    // usare il bucket di default associato all'app Replit.
    client = new Client(bucketId ? { bucketId } : undefined);
  }
  return client;
}

/**
 * Converte un fileUrl memorizzato (es. "/uploads/abc.jpg") nella chiave oggetto
 * ("uploads/abc.jpg") SOLO se è un percorso /uploads sicuro: niente URL esterni,
 * niente path traversal, niente caratteri fuori allowlist.
 */
export function objectKeyFromUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return null;
  const normalized = fileUrl.replace(/^\/+/, "");
  if (!/^uploads\/[A-Za-z0-9_\-./]+$/.test(normalized)) return null;
  if (normalized.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    return null;
  }
  return normalized;
}

/**
 * Rende persistente un file appena scritto da multer su disco locale.
 * - modalità local: no-op (il file resta dove multer l'ha scritto);
 * - modalità object-storage: carica il file nel bucket con chiave uguale al
 *   percorso pubblico (senza slash iniziale) e rimuove il file temporaneo
 *   locale. In caso di errore di upload LANCIA (niente fallback silenzioso su
 *   disco locale) e lascia al chiamante la pulizia del file temporaneo.
 */
export async function persistUploadedFile(localPath: string, fileUrl: string): Promise<void> {
  if (!isObjectStorageMode()) return;

  const key = objectKeyFromUrl(fileUrl);
  if (!key) {
    throw new Error(`persistUploadedFile: fileUrl non valido (${fileUrl})`);
  }

  const { ok, error } = await getClient().uploadFromFilename(key, localPath, {
    compress: false,
  });
  if (!ok) {
    throw new Error(`Upload su object storage fallito: ${String(error)}`);
  }

  // Il file temporaneo locale non serve più (e su autoscale sparirebbe comunque).
  await fs.unlink(localPath).catch(() => {});
}

/**
 * Verifica se un oggetto /uploads/* esiste nel bucket. In modalità local
 * ritorna sempre false (il chiamante controlla il disco). Lancia in caso di
 * errore di comunicazione col bucket: il chiamante decide come degradare
 * (niente false negativi silenziosi che sprecherebbero quota AI).
 */
export async function uploadObjectExists(fileUrl: string): Promise<boolean> {
  if (!isObjectStorageMode()) return false;
  const key = objectKeyFromUrl(fileUrl);
  if (!key) return false;
  const { ok, error, value } = await getClient().exists(key);
  if (!ok) {
    throw new Error(`Object storage exists fallito (${key}): ${String(error)}`);
  }
  return value;
}

/**
 * Elenca le chiavi di TUTTI gli oggetti sotto il prefisso "uploads/" nel
 * bucket. In modalità local ritorna [] (non c'è bucket da scandire).
 * Lancia in caso di errore di comunicazione col bucket (fail-closed: il
 * chiamante deve interrompere la scansione, niente falsi "non referenziato").
 */
export async function listUploadObjects(): Promise<string[]> {
  if (!isObjectStorageMode()) return [];
  const { ok, error, value } = await getClient().list({ prefix: "uploads/" });
  if (!ok) {
    throw new Error(`Object storage list fallito (uploads/): ${String(error)}`);
  }
  return value.map((obj) => obj.name);
}

/**
 * Elimina in modo sicuro i file corrispondenti agli URL forniti da TUTTI gli
 * storage: sempre dal disco locale (copre i file legacy pre-migrazione) e, in
 * modalità object-storage, anche dal bucket. Non lancia mai: la cancellazione
 * best-effort non deve bloccare l'operazione principale (es. delete messaggio).
 */
export async function deleteStoredUploads(
  fileUrls: Array<string | null | undefined>
): Promise<FileCleanupResult> {
  const localResult = await deleteUploadFiles(fileUrls);

  if (isObjectStorageMode()) {
    for (const url of fileUrls) {
      const key = objectKeyFromUrl(url);
      if (!key) continue;
      try {
        const { ok, error } = await getClient().delete(key, { ignoreNotFound: true });
        if (!ok) {
          localResult.failed++;
          logger.warn("Object storage delete fallita", { key, error: String(error) });
        }
      } catch (error) {
        localResult.failed++;
        logger.warn("Object storage delete fallita", { key, error: String(error) });
      }
    }
  }

  return localResult;
}

// Content-Type per il download: derivato dall'estensione memorizzata (che a sua
// volta deriva dal MIME verificato in upload), mai dal nome originale.
const EXTENSION_MIMES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

/**
 * Handler Express che, in modalità object-storage, serve i file /uploads/*
 * direttamente dal bucket. Se l'oggetto non esiste passa a next() (fallback
 * allo static locale per eventuali file legacy). In modalità local è un no-op.
 *
 * Va montato con un prefisso (es. app.use('/uploads', ..., createUploadsObjectHandler('/uploads'), express.static('uploads'))).
 */
export function createUploadsObjectHandler(
  mountPrefix: string,
  options?: { cacheControl?: string }
) {
  const cacheControl = options?.cacheControl ?? "private, max-age=3600";
  return async function uploadsObjectHandler(req: Request, res: Response, next: NextFunction) {
    if (!isObjectStorageMode()) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    // req.path è relativo al mount point (es. "/abc.jpg" o "/avatars/x.png").
    // Decodifica difensiva: percent-encoding malformato non deve dare 500.
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      return next();
    }

    // Rifiuta QUALSIASI segmento di traversal PRIMA della normalizzazione: un
    // mount pubblico (es. /uploads/avatars) non deve mai poter risalire a
    // chiavi private (es. uploads/<allegato> protetto da authenticateMedia).
    if (decodedPath.includes("\\") || decodedPath.split("/").some((seg) => seg === "." || seg === "..")) {
      return next();
    }

    const fileUrl = path.posix.join(mountPrefix, decodedPath);
    const key = objectKeyFromUrl(fileUrl);
    if (!key) return next();

    // Confinamento al mount: dopo join/normalizzazione la chiave DEVE restare
    // dentro il prefisso del mount (difesa in profondità oltre al check sopra).
    const mountKeyPrefix = mountPrefix.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
    if (!key.startsWith(mountKeyPrefix)) {
      return next();
    }

    try {
      const exists = await getClient().exists(key);
      if (!exists.ok || !exists.value) return next();

      const ext = path.posix.extname(key).toLowerCase();
      const mime = EXTENSION_MIMES[ext] || "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", cacheControl);
      if (req.method === "HEAD") {
        return res.status(200).end();
      }

      const stream = getClient().downloadAsStream(key, { decompress: false });
      stream.on("error", (error: unknown) => {
        logger.error("Object storage stream error", { key, error: String(error) });
        if (!res.headersSent) {
          res.status(500).json({ error: "Errore nel download del file" });
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (error) {
      logger.error("Object storage download error", { key, error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Errore nel download del file" });
      }
    }
  };
}

/**
 * Log di avvio: in produzione senza storage persistente resta il warning
 * UPLOAD_STORAGE_WARNING; con object-storage attivo logga la conferma.
 */
export function logUploadStorageStatus(): void {
  if (isObjectStorageMode()) {
    logger.info("Upload storage: Replit Object Storage attivo", {
      tag: "UPLOAD_STORAGE",
      bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? "custom" : "default",
    });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    logger.warn("UPLOAD_STORAGE_WARNING", {
      tag: "UPLOAD_STORAGE_WARNING",
      msg: "Using local disk uploads in production is fragile. Set STORAGE_MODE=object-storage to use persistent Replit Object Storage.",
    });
  }
}

export { uploadsDir };
