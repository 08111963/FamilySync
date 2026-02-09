import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { chores, familyMembers } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { getBlockedUserIds, applyBlockedFilter } from '../lib/block-filter';
import { logger } from '../lib/logger';

const router = Router();

const createChoreSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  points: z.number().int().min(1).optional().default(10),
  estimatedMinutes: z.number().int().min(0).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  recurrenceRule: z.string().optional(),
});

const updateChoreSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  points: z.number().int().min(1).optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
}).strict();

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const blockedIds = await getBlockedUserIds(req.user!.userId, familyId);

    const conditions: any[] = [eq(chores.familyId, familyId)];
    const blockFilter = applyBlockedFilter(chores.createdBy, blockedIds);
    if (blockFilter) conditions.push(blockFilter);

    const choresList = await db.select().from(chores).where(and(...conditions));
    res.json(choresList);
  } catch (error) {
    logger.error('Get chores error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero faccende" } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const parsed = createChoreSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [chore] = await db.insert(chores).values({
      familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      difficulty: parsed.data.difficulty ?? null,
      points: parsed.data.points,
      estimatedMinutes: parsed.data.estimatedMinutes ?? null,
      assignedTo: parsed.data.assignedTo,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      recurrenceRule: parsed.data.recurrenceRule,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'chore_created', chore);
    res.status(201).json(chore);
  } catch (error) {
    logger.error('Create chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della faccenda" } });
  }
});

router.put('/:familyId/:choreId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, choreId } = req.params;

    const parsed = updateChoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const updateData: Record<string, any> = { ...parsed.data, updatedAt: new Date() };
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }

    const [chore] = await db.update(chores)
      .set(updateData)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    if (!chore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    broadcastToFamily(familyId, 'chore_updated', chore);
    res.json(chore);
  } catch (error) {
    logger.error('Update chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});

router.patch('/:familyId/:choreId/complete', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, choreId } = req.params;

    const [currentChore] = await db.select().from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .limit(1);

    if (!currentChore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    if (currentChore.isCompleted) {
      return res.status(400).json({ error: { code: "ALREADY_COMPLETED", message: "Faccenda già completata" } });
    }

    const pointsToAdd = currentChore.points || 10;

    const [chore] = await db.update(chores)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    if (currentChore.assignedTo) {
      await db.update(familyMembers)
        .set({
          points: sql`COALESCE(${familyMembers.points}, 0) + ${pointsToAdd}`,
        })
        .where(eq(familyMembers.id, currentChore.assignedTo));
    }

    broadcastToFamily(familyId, 'chore_completed', chore);
    res.json(chore);
  } catch (error) {
    logger.error('Complete chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel completamento" } });
  }
});

router.delete('/:familyId/:choreId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, choreId } = req.params;

    await db.delete(chores).where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)));

    broadcastToFamily(familyId, 'chore_deleted', { choreId });
    res.json({ message: 'Faccenda eliminata' });
  } catch (error) {
    logger.error('Delete chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
