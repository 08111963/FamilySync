import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { reports, blocks, users, familyMembers, calendarEvents, shoppingItems, shoppingLists, chores } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireFamilyAdmin } from "../middleware/family";
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

    if (targetType === "calendar_event") {
      const [evt] = await db.select({ id: calendarEvents.id }).from(calendarEvents)
        .where(and(eq(calendarEvents.id, targetId), eq(calendarEvents.familyId, familyId))).limit(1);
      if (!evt) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Evento non trovato in questa famiglia" } });
      }
    } else if (targetType === "shopping_item") {
      const itemWithList = await db.select({ itemId: shoppingItems.id }).from(shoppingItems)
        .innerJoin(shoppingLists, eq(shoppingItems.listId, shoppingLists.id))
        .where(and(eq(shoppingItems.id, targetId), eq(shoppingLists.familyId, familyId))).limit(1);
      if (itemWithList.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa famiglia" } });
      }
    } else if (targetType === "chore") {
      const [ch] = await db.select({ id: chores.id }).from(chores)
        .where(and(eq(chores.id, targetId), eq(chores.familyId, familyId))).limit(1);
      if (!ch) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata in questa famiglia" } });
      }
    } else if (targetType === "user") {
      const [targetMember] = await db.select({ id: familyMembers.id }).from(familyMembers)
        .where(and(eq(familyMembers.userId, targetId), eq(familyMembers.familyId, familyId))).limit(1);
      if (!targetMember) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Utente non trovato in questa famiglia" } });
      }
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
    const statusFilter = req.query.status as string | undefined;

    const conditions = [eq(reports.familyId, familyId)];
    if (statusFilter) {
      conditions.push(eq(reports.status, statusFilter as any));
    }

    const reportsList = await db
      .select()
      .from(reports)
      .where(and(...conditions))
      .orderBy(desc(reports.createdAt));

    const enriched = await Promise.all(
      reportsList.map(async (r) => {
        const [reporter] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, r.reporterUserId))
          .limit(1);
        return { ...r, reporterName: reporter?.name || "Sconosciuto" };
      })
    );

    res.json(enriched);
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

    await db.delete(blocks).where(
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

    const userBlocks = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.familyId, familyId), eq(blocks.blockerUserId, req.user!.userId)));

    const enriched = await Promise.all(
      userBlocks.map(async (b) => {
        const [blockedUser] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, b.blockedUserId))
          .limit(1);
        return {
          id: b.id,
          blockedUserId: b.blockedUserId,
          blockedUserName: blockedUser?.name || "Sconosciuto",
          createdAt: b.createdAt,
        };
      })
    );

    res.json(enriched);
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
