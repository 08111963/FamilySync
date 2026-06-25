import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { db } from "../db";
import { chatMessages, familyMembers, users } from "../../shared/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { getBlockRelatedUserIds, applyBlockedFilter } from "../lib/block-filter";
import { broadcastToFamily, broadcastChatMessageToFamily } from "../lib/websocket";
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString("hex");
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo di file non supportato"));
    }
  },
});

async function verifyFamilyMembership(userId: string, familyId: string) {
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return membership;
}

router.get("/:familyId/messages", authenticate, async (req: Request, res: Response) => {
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

router.post("/:familyId/messages", authenticate, async (req: Request, res: Response) => {
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

router.post("/:familyId/upload", authenticate, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const familyId = req.params.familyId as string;
    const caption = req.body.caption as string | undefined;

    if (!req.file) {
      return res.status(400).json({ error: "Nessun file caricato" });
    }

    const membership = await verifyFamilyMembership(userId, familyId);
    if (!membership) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(403).json({ error: "Non fai parte di questa famiglia" });
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

router.delete("/:familyId/messages/:messageId", authenticate, async (req: Request, res: Response) => {
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
      const filePath = path.resolve(message.fileUrl.replace(/^\//, ""));
      fs.unlink(filePath, () => {});
    }

    await db.delete(chatMessages).where(eq(chatMessages.id, messageId));

    broadcastToFamily(familyId, "chat:message_deleted", { messageId });

    res.json({ success: true });
  } catch (error) {
    logger.error("Errore DELETE messaggio chat", { error: String(error) });
    res.status(500).json({ error: "Errore nell'eliminazione del messaggio" });
  }
});

export default router;
