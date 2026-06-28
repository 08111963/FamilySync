import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { db } from "../db";
import { chatMessages, familyMembers, users } from "../../shared/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { getBlockRelatedUserIds, applyBlockedFilter } from "../lib/block-filter";
import { broadcastChatMessageToFamily } from "../lib/websocket";
import { logger } from "../lib/logger";

const router = Router();

interface ChatStorageResult {
  url: string;
  mime: string;
  size: number;
  filename: string;
}

interface ChatStorage {
  save(file: Express.Multer.File, req: Request): Promise<ChatStorageResult>;
}

function getUploadBaseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    return `${proto}://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

function withAbsoluteFileUrl<T extends { fileUrl?: string | null }>(msg: T, req: Request): T & { fileUrlAbs?: string } {
  if (msg.fileUrl) {
    const base = getUploadBaseUrl(req);
    return { ...msg, fileUrlAbs: new URL(msg.fileUrl, base).toString() };
  }
  return msg;
}

const localDiskStorage: ChatStorage = {
  async save(file, req) {
    const relativeUrl = `/uploads/${file.filename}`;
    return {
      url: relativeUrl,
      mime: file.mimetype,
      size: file.size,
      filename: file.originalname,
    };
  },
};

// TODO: Future storage implementations (no new dependencies needed to add):
// - S3Storage: implements ChatStorage using AWS SDK
// - R2Storage: implements ChatStorage using Cloudflare R2
// - SupabaseStorage: implements ChatStorage using Supabase Storage

function getChatStorage(): ChatStorage {
  // const mode = process.env.STORAGE_MODE || "local";
  // switch (mode) {
  //   case "s3": return s3Storage;
  //   case "r2": return r2Storage;
  //   default: return localDiskStorage;
  // }
  return localDiskStorage;
}

const chatFileStorage = getChatStorage();

let uploadWarningLogged = false;
if (process.env.NODE_ENV === "production" && !process.env.STORAGE_MODE) {
  logger.warn("UPLOAD_STORAGE_WARNING", {
    tag: "UPLOAD_STORAGE_WARNING",
    msg: "Using local disk uploads in production is fragile. Consider S3/R2/Supabase by setting STORAGE_MODE env var.",
  });
  uploadWarningLogged = true;
}

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Returns true only for MIME types we explicitly allow. The decision is based on
// the declared MIME, never on the (spoofable) original filename.
export function isAllowedUploadMime(mimetype: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mimetype);
}

// Builds the on-disk filename. The extension is derived from the allowed MIME
// map, NOT from the client-provided original name, so a file named
// "documento.pdf" sent as image/png is stored with a ".png" extension.
export function resolveUploadExtension(mimetype: string): string {
  return MIME_EXTENSIONS[mimetype] ?? "";
}

export function buildStoredFilename(mimetype: string, randomName: string): string {
  return `${randomName}${resolveUploadExtension(mimetype)}`;
}

// Resolves a stored fileUrl to an absolute path ONLY if it stays inside
// uploadsDir. Any path-traversal attempt (e.g. "/uploads/../../etc/passwd")
// resolves outside the directory and yields null, so the caller skips deletion.
export function resolveSafeUploadPath(fileUrl: string, baseDir: string = uploadsDir): string | null {
  const filePath = path.resolve(fileUrl.replace(/^\//, ""));
  if (filePath.startsWith(baseDir + path.sep)) {
    return filePath;
  }
  return null;
}

// MIME types for which we verify the file's real content signature (magic
// bytes), not just the client-declared (spoofable) MIME. A file declared as
// image/png but containing non-PNG bytes fails this check and is rejected.
export const MAGIC_VERIFIED_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// WORD DOCUMENTS: we verify the container signature, with the documented caveat
// that these signatures are NOT specific to Word:
// - .docx is a ZIP container (signature "PK\x03\x04"), shared with every other
//   zip-based format (xlsx, pptx, plain .zip, ...). We confirm it is a valid zip
//   container but cannot prove the inner content is a Word document.
// - .doc is an OLE compound file ("D0 CF 11 E0 A1 B1 1A E1"), shared with legacy
//   xls/ppt. We confirm the OLE signature but not that it is specifically a Word
//   file.
// text/plain (.txt) is still intentionally NOT allowed because it has no
// signature at all (any byte sequence is valid text).

// Verifies that the leading bytes of a file match the signature expected for the
// declared MIME. Returns true for types not in MAGIC_VERIFIED_MIMES (see the
// documented limitation above) so they pass through on the declared MIME alone.
export function verifyMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (!MAGIC_VERIFIED_MIMES.has(mimetype)) {
    return true;
  }
  switch (mimetype) {
    case "image/jpeg":
      // FF D8 FF
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
      );
    case "image/gif":
      // "GIF87a" or "GIF89a"
      return (
        buffer.length >= 6 &&
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
        buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
      );
    case "image/webp":
      // "RIFF" .... "WEBP"
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      );
    case "application/pdf":
      // "%PDF-"
      return (
        buffer.length >= 5 &&
        buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d
      );
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      // .docx is a ZIP container: "PK" 03 04 (also 05 06 / 07 08 for empty/spanned)
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 && buffer[1] === 0x4b &&
        ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
          (buffer[2] === 0x05 && buffer[3] === 0x06) ||
          (buffer[2] === 0x07 && buffer[3] === 0x08))
      );
    case "application/msword":
      // .doc is an OLE compound file: D0 CF 11 E0 A1 B1 1A E1
      return (
        buffer.length >= 8 &&
        buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
        buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
      );
    default:
      return false;
  }
}

// Reads the leading bytes of a file (default 12, enough for every signature we
// check) so verifyMagicBytes can inspect the real content.
export function readMagicBytes(filePath: string, length: number = 12): Buffer {
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const name = crypto.randomBytes(16).toString("hex");
    cb(null, buildStoredFilename(file.mimetype, name));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  },
});

// Route-level error handler for the upload middleware. Maps multer/fileFilter
// rejections to clean 4xx responses instead of a generic 500.
function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!err) {
    return next();
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File troppo grande (max 10MB)" });
    }
    return res.status(400).json({ error: "Errore nel caricamento del file" });
  }
  return res.status(415).json({ error: "Tipo di file non supportato" });
}

async function verifyFamilyMembership(userId: string, familyId: string) {
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return membership;
}

async function requireFamilyMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }
    next();
  } catch (error) {
    logger.error("Errore verifica membership chat", { error: String(error) });
    res.status(500).json({ error: "Errore nella verifica di appartenenza" });
  }
}

router.get("/:familyId/messages", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }

    const blockedIds = await getBlockRelatedUserIds(userId, familyId);
    const blockFilter = applyBlockedFilter(chatMessages.userId, blockedIds);

    const conditions = [eq(chatMessages.familyId, familyId)];
    if (cursor) {
      conditions.push(lt(chatMessages.createdAt, new Date(cursor)));
    }
    if (blockFilter) {
      conditions.push(blockFilter);
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        familyId: chatMessages.familyId,
        userId: chatMessages.userId,
        messageType: chatMessages.messageType,
        content: chatMessages.content,
        fileUrl: chatMessages.fileUrl,
        fileName: chatMessages.fileName,
        fileMimeType: chatMessages.fileMimeType,
        fileSize: chatMessages.fileSize,
        createdAt: chatMessages.createdAt,
        userName: users.name,
        userAvatar: users.avatarUrl,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit + 1);

    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(0, limit) : messages;

    const enriched = result.map((m) => withAbsoluteFileUrl(m, req));

    res.json({
      messages: enriched,
      hasMore,
      nextCursor: hasMore ? result[result.length - 1].createdAt.toISOString() : null,
    });
  } catch (error) {
    logger.error("Errore GET messaggi chat", { error: String(error) });
    res.status(500).json({ error: "Errore nel recupero dei messaggi" });
  }
});

router.post("/:familyId/messages", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const { content } = req.body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "Il messaggio non può essere vuoto" });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: "Messaggio troppo lungo (max 2000 caratteri)" });
    }

    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
    }

    const [user] = await db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);

    const [message] = await db
      .insert(chatMessages)
      .values({
        familyId,
        userId,
        messageType: "text",
        content: content.trim(),
      })
      .returning();

    const fullMessage = {
      ...message,
      userName: user.name,
      userAvatar: user.avatarUrl,
    };

    const enrichedMessage = withAbsoluteFileUrl(fullMessage, req);

    await broadcastChatMessageToFamily(familyId, userId, "chat:new_message", enrichedMessage);

    res.status(201).json(enrichedMessage);
  } catch (error) {
    logger.error("Errore POST messaggio chat", { error: String(error) });
    res.status(500).json({ error: "Errore nell'invio del messaggio" });
  }
});

router.post("/:familyId/upload", requireFamilyMembership, upload.single("file"), handleUploadError, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const caption = req.body.caption as string | undefined;

    if (!req.file) {
      return res.status(400).json({ error: "Nessun file caricato" });
    }

    // Real content check: the declared MIME passed the allowlist, but we now
    // verify the magic bytes. A spoofed file (e.g. declared image/png with
    // non-PNG content) is rejected here, deleted from disk, and never reaches
    // the database.
    const magic = readMagicBytes(req.file.path);
    if (!verifyMagicBytes(magic, req.file.mimetype)) {
      const spoofedPath = req.file.path;
      fs.unlink(spoofedPath, (unlinkErr) => {
        if (unlinkErr) {
          logger.warn("Chat upload: impossibile cancellare file spoofato", {
            path: spoofedPath,
            error: String(unlinkErr),
          });
        }
      });
      return res.status(415).json({ error: "Il contenuto del file non corrisponde al tipo dichiarato" });
    }

    const [user] = await db.select({ name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);

    if (process.env.NODE_ENV === "production" && !process.env.STORAGE_MODE && !uploadWarningLogged) {
      logger.warn("UPLOAD_STORAGE_WARNING", {
        tag: "UPLOAD_STORAGE_WARNING",
        msg: "Using local disk uploads in production is fragile. Consider S3/R2/Supabase by setting STORAGE_MODE env var.",
      });
      uploadWarningLogged = true;
    }

    const stored = await chatFileStorage.save(req.file, req);
    const isImage = stored.mime.startsWith("image/");

    const [message] = await db
      .insert(chatMessages)
      .values({
        familyId,
        userId,
        messageType: isImage ? "image" : "file",
        content: caption?.trim() || null,
        fileUrl: stored.url,
        fileName: stored.filename,
        fileMimeType: stored.mime,
        fileSize: stored.size,
      })
      .returning();

    const fullMessage = {
      ...message,
      userName: user.name,
      userAvatar: user.avatarUrl,
    };

    const enrichedUpload = withAbsoluteFileUrl(fullMessage, req);

    await broadcastChatMessageToFamily(familyId, userId, "chat:new_message", enrichedUpload);

    res.status(201).json(enrichedUpload);
  } catch (error) {
    logger.error("Errore POST upload chat", { error: String(error) });
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: "Errore nel caricamento del file" });
  }
});

router.delete("/:familyId/messages/:messageId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const messageId = req.params.messageId as string;

    const [message] = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.familyId, familyId)))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: "Messaggio non trovato" });
    }

    if (message.userId !== userId) {
      return res.status(403).json({ error: "Puoi eliminare solo i tuoi messaggi" });
    }

    if (message.fileUrl) {
      const safePath = resolveSafeUploadPath(message.fileUrl);
      if (safePath) {
        fs.unlink(safePath, () => {});
      } else {
        logger.warn("Chat delete: file path fuori da uploadsDir, skip unlink", {
          messageId,
          fileUrl: message.fileUrl,
        });
      }
    }

    await db.delete(chatMessages).where(eq(chatMessages.id, messageId));

    await broadcastChatMessageToFamily(familyId, message.userId, "chat:message_deleted", { messageId });

    res.json({ success: true });
  } catch (error) {
    logger.error("Errore DELETE messaggio chat", { error: String(error) });
    res.status(500).json({ error: "Errore nell'eliminazione del messaggio" });
  }
});

export default router;
