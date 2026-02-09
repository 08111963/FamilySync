import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { db } from "../db";
import { chatMessages, familyMembers, users } from "../../shared/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { getBlockedUserIds, applyBlockedFilter } from "../lib/block-filter";
import { broadcastToFamily } from "../lib/websocket";
import { logger } from "../lib/logger";

const router = Router();

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

    const blockedIds = await getBlockedUserIds(userId, familyId);
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

    res.json({
      messages: result,
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

    broadcastToFamily(familyId, "chat:new_message", fullMessage);

    res.status(201).json(fullMessage);
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

    const isImage = req.file.mimetype.startsWith("image/");
    const fileUrl = `/uploads/${req.file.filename}`;

    const [message] = await db
      .insert(chatMessages)
      .values({
        familyId,
        userId,
        messageType: isImage ? "image" : "file",
        content: caption?.trim() || null,
        fileUrl,
        fileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size,
      })
      .returning();

    const fullMessage = {
      ...message,
      userName: user.name,
      userAvatar: user.avatarUrl,
    };

    broadcastToFamily(familyId, "chat:new_message", fullMessage);

    res.status(201).json(fullMessage);
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
