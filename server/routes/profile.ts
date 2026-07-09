import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../shared/schema";
import { logger } from "../lib/logger";
import { deleteUploadFiles } from "../lib/uploads-cleanup";
import { isAllowedUploadMime, buildStoredFilename, verifyMagicBytes, readMagicBytes } from "./chat";

const router = Router();

// Gli avatar profilo vivono in una sottocartella dedicata di /uploads. Vengono
// serviti PUBBLICAMENTE (vedi server/routes.ts) come le foto ricette: sono
// immagini di profilo mostrate ovunque nell'app, non contengono dati sensibili
// e servirle senza media-token evita di dover propagare il token in ogni Avatar.
const avatarsDir = path.resolve("uploads/avatars");
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (_req, file, cb) =>
    cb(null, buildStoredFilename(file.mimetype, crypto.randomBytes(16).toString("hex"))),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (_req, file, cb) => {
    // Solo immagini (niente PDF): l'avatar è per definizione un'immagine.
    if (file.mimetype.startsWith("image/") && isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  },
});

function handleUploadError(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Immagine troppo grande (max 5MB)" } });
    }
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message: "Errore nel caricamento dell'immagine" } });
  }
  return res.status(415).json({ error: { code: "UNSUPPORTED_TYPE", message: "Tipo di file non supportato" } });
}

// Aggiorna la foto profilo dell'utente autenticato. La foto è a livello UTENTE
// (users.avatarUrl), quindi vale in tutte le famiglie a cui appartiene.
router.post(
  "/avatar",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err) => handleUploadError(err, req, res, next));
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    try {
      if (!file) {
        return res.status(400).json({ error: { code: "NO_FILE", message: "Nessuna immagine ricevuta" } });
      }

      // Verifica del contenuto reale (magic bytes), non del solo MIME dichiarato.
      const magic = readMagicBytes(file.path);
      if (!verifyMagicBytes(magic, file.mimetype)) {
        await deleteUploadFiles([`/uploads/avatars/${file.filename}`]);
        return res.status(415).json({ error: { code: "INVALID_IMAGE", message: "Il file non è un'immagine valida" } });
      }

      const newUrl = `/uploads/avatars/${file.filename}`;
      const [prev] = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, req.user!.userId))
        .limit(1);

      await db.update(users).set({ avatarUrl: newUrl }).where(eq(users.id, req.user!.userId));

      // Rimuove la vecchia foto dal disco (solo se era un nostro avatar locale).
      if (prev?.avatarUrl && prev.avatarUrl.startsWith("/uploads/avatars/")) {
        await deleteUploadFiles([prev.avatarUrl]);
      }

      res.json({ avatarUrl: newUrl });
    } catch (error) {
      // In caso di errore imprevisto non lasciamo file orfani sul disco.
      if (file) await deleteUploadFiles([`/uploads/avatars/${file.filename}`]);
      logger.error("Avatar upload error", { error: String(error) });
      res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel salvataggio della foto" } });
    }
  }
);

// Rimuove la foto profilo dell'utente autenticato (torna alle iniziali).
router.delete("/avatar", async (req: Request, res: Response) => {
  try {
    const [prev] = await db
      .select({ avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    await db.update(users).set({ avatarUrl: null }).where(eq(users.id, req.user!.userId));

    if (prev?.avatarUrl && prev.avatarUrl.startsWith("/uploads/avatars/")) {
      await deleteUploadFiles([prev.avatarUrl]);
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error("Avatar delete error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione della foto" } });
  }
});

export default router;
