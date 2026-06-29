import fs from "fs/promises";
import path from "path";

/**
 * Directory fisica degli upload (stessa usata da chat e bollette).
 */
export const uploadsDir = path.resolve("uploads");

/**
 * Risolve un fileUrl memorizzato (es. "/uploads/abc.jpg") nel percorso assoluto
 * SOLO se resta dentro uploadsDir. Qualsiasi tentativo di path traversal
 * (es. "/uploads/../../etc/passwd") risolve fuori dalla directory e ritorna null,
 * cosi il chiamante salta la cancellazione. Gli URL esterni (http/https) o i
 * percorsi non in /uploads ritornano null e vengono ignorati.
 */
export function resolveSafeUploadPath(
  fileUrl: string,
  baseDir: string = uploadsDir
): string | null {
  if (!fileUrl) return null;
  // Ignora SEMPRE gli URL assoluti esterni (es. avatar ospitati altrove): non
  // sono file locali in /uploads e non vanno mai cancellati dal nostro disco.
  if (/^https?:\/\//i.test(fileUrl)) {
    return null;
  }
  const filePath = path.resolve(fileUrl.replace(/^\/+/, ""));
  if (filePath === baseDir) return null;
  if (filePath.startsWith(baseDir + path.sep)) {
    return filePath;
  }
  return null;
}

export interface FileCleanupResult {
  deleted: number;
  missing: number;
  failed: number;
}

/**
 * Elimina dal filesystem i file fisici corrispondenti agli URL forniti, in modo
 * sicuro:
 * - opera SOLO dentro uploadsDir (niente path traversal);
 * - ignora i file gia mancanti (ENOENT);
 * - non interrompe il flusso in caso di errore su un singolo file;
 * - non espone percorsi sensibili (logga solo il codice di errore).
 *
 * I valori null/undefined/duplicati vengono ignorati.
 */
export async function deleteUploadFiles(
  fileUrls: Array<string | null | undefined>
): Promise<FileCleanupResult> {
  const result: FileCleanupResult = { deleted: 0, missing: 0, failed: 0 };

  const safePaths = new Set<string>();
  for (const url of fileUrls) {
    if (!url) continue;
    const safe = resolveSafeUploadPath(url);
    if (safe) safePaths.add(safe);
  }

  for (const filePath of safePaths) {
    try {
      await fs.unlink(filePath);
      result.deleted++;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        result.missing++;
      } else {
        result.failed++;
        // Non logghiamo il percorso completo per non esporre dati sensibili.
        console.error("Eliminazione file upload fallita", { code: code ?? "UNKNOWN" });
      }
    }
  }

  return result;
}
