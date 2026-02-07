import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { reports, blocks, users, familyMembers } from "../../shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireFamilyMember, requireFamilyAdmin } from "../middleware/family";
import { logger } from "../lib/logger";

const router = Router();

const createReportSchema = z.object({
  familyId: z.string().uuid(),
  targetType: z.enum(["calendar_event", "shopping_item", "chore", "user"]),
  targetId: z.string().uuid(),
  reasonCategory: z.enum(["spam", "harassment", "hate", "sexual", "violence", "other"]),
  reasonText: z.string().max(500).optional(),
});

const createBlockSchema = z.object({
  familyId: z.string().uuid(),
  blockedUserId: z.string().uuid(),
});

router.post("/report", authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { familyId, targetType, targetId, reasonCategory, reasonText } = parsed.data;

    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.userId, req.user!.userId), eq(familyMembers.familyId, familyId)))
      .limit(1);

    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" },
      });
    }

    const [report] = await db
      .insert(reports)
      .values({
        familyId,
        reporterUserId: req.user!.userId,
        targetType,
        targetId,
        reasonCategory,
        reasonText: reasonText || null,
      })
      .returning();

    res.status(201).json(report);
  } catch (error) {
    logger.error("Create report error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della segnalazione" } });
  }
});

router.get("/reports/:familyId", authenticate, requireFamilyAdmin(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const status = req.query.status as string | undefined;

    let query = db
      .select({
        id: reports.id,
        familyId: reports.familyId,
        reporterUserId: reports.reporterUserId,
        targetType: reports.targetType,
        targetId: reports.targetId,
        reasonCategory: reports.reasonCategory,
        reasonText: reports.reasonText,
        status: reports.status,
        createdAt: reports.createdAt,
        reporterName: users.name,
      })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.reporterUserId))
      .where(
        status
          ? and(eq(reports.familyId, familyId), eq(reports.status, status as any))
          : eq(reports.familyId, familyId)
      )
      .orderBy(desc(reports.createdAt));

    const results = await query;
    res.json(results);
  } catch (error) {
    logger.error("Get reports error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero segnalazioni" } });
  }
});

router.patch("/reports/:familyId/:reportId", authenticate, requireFamilyAdmin(), async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;

    if (!["actioned", "dismissed"].includes(status)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Stato non valido. Usa 'actioned' o 'dismissed'" },
      });
    }

    const [updated] = await db
      .update(reports)
      .set({ status, updatedAt: new Date() })
      .where(eq(reports.id, reportId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Segnalazione non trovata" } });
    }

    res.json(updated);
  } catch (error) {
    logger.error("Update report error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});

router.post("/block", authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = createBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { familyId, blockedUserId } = parsed.data;

    if (blockedUserId === req.user!.userId) {
      return res.status(400).json({
        error: { code: "CANNOT_BLOCK_SELF", message: "Non puoi bloccare te stesso" },
      });
    }

    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.userId, req.user!.userId), eq(familyMembers.familyId, familyId)))
      .limit(1);

    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" },
      });
    }

    const [block] = await db
      .insert(blocks)
      .values({
        familyId,
        blockerUserId: req.user!.userId,
        blockedUserId,
      })
      .onConflictDoNothing()
      .returning();

    if (!block) {
      return res.json({ message: "Utente già bloccato" });
    }

    res.status(201).json(block);
  } catch (error) {
    logger.error("Create block error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel blocco utente" } });
  }
});

router.delete("/block/:familyId/:blockedUserId", authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, blockedUserId } = req.params;

    await db
      .delete(blocks)
      .where(
        and(
          eq(blocks.familyId, familyId),
          eq(blocks.blockerUserId, req.user!.userId),
          eq(blocks.blockedUserId, blockedUserId)
        )
      );

    res.json({ message: "Utente sbloccato" });
  } catch (error) {
    logger.error("Delete block error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nello sblocco utente" } });
  }
});

router.get("/blocks/:familyId", authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.userId, req.user!.userId), eq(familyMembers.familyId, familyId)))
      .limit(1);

    if (!membership) {
      return res.status(403).json({
        error: { code: "NOT_FAMILY_MEMBER", message: "Non fai parte di questa famiglia" },
      });
    }

    const blockedUsers = await db
      .select({
        id: blocks.id,
        blockedUserId: blocks.blockedUserId,
        blockedUserName: users.name,
        createdAt: blocks.createdAt,
      })
      .from(blocks)
      .leftJoin(users, eq(users.id, blocks.blockedUserId))
      .where(and(eq(blocks.familyId, familyId), eq(blocks.blockerUserId, req.user!.userId)));

    res.json(blockedUsers);
  } catch (error) {
    logger.error("Get blocks error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero utenti bloccati" } });
  }
});

router.patch("/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const { aiFeaturesEnabled } = req.body;

    if (typeof aiFeaturesEnabled !== "boolean") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "aiFeaturesEnabled deve essere un booleano" },
      });
    }

    const [updated] = await db
      .update(users)
      .set({ aiFeaturesEnabled, updatedAt: new Date() })
      .where(eq(users.id, req.user!.userId))
      .returning({
        id: users.id,
        aiFeaturesEnabled: users.aiFeaturesEnabled,
      });

    res.json(updated);
  } catch (error) {
    logger.error("Update preferences error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento preferenze" } });
  }
});

router.get("/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const [user] = await db
      .select({ aiFeaturesEnabled: users.aiFeaturesEnabled })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    res.json({ aiFeaturesEnabled: user?.aiFeaturesEnabled ?? true });
  } catch (error) {
    logger.error("Get preferences error", { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero preferenze" } });
  }
});

export default router;
