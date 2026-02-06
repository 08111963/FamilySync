import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { chores, familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';

const router = Router();

const createChoreSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
  points: z.number().int().min(1).optional().default(10),
  estimatedMinutes: z.number().int().optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  recurrenceRule: z.string().optional(),
});

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const choresList = await db.select().from(chores).where(eq(chores.familyId, familyId));
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
      difficulty: parsed.data.difficulty,
      points: parsed.data.points,
      estimatedMinutes: parsed.data.estimatedMinutes,
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

    const updateData = { ...req.body, updatedAt: new Date() };
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
    const membership = (req as any).membership;

    const [currentChore] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1);

    if (!currentChore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    if (currentChore.isCompleted) {
      return res.status(400).json({ error: { code: "ALREADY_COMPLETED", message: "Faccenda già completata" } });
    }

    const [chore] = await db.update(chores)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(chores.id, choreId))
      .returning();

    if (currentChore.assignedTo) {
      await db.update(familyMembers)
        .set({ points: (membership.points || 0) + (currentChore.points || 10) })
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
