import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { chores, familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { broadcastToFamily } from '../lib/websocket';

const router = Router();

async function checkFamilyAccess(userId: string, familyId: string) {
  const membership = await db.select()
    .from(familyMembers)
    .where(and(
      eq(familyMembers.userId, userId),
      eq(familyMembers.familyId, familyId)
    ))
    .limit(1);
  return membership.length > 0 ? membership[0] : null;
}

// GET CHORES
router.get('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const choresList = await db.select().from(chores).where(eq(chores.familyId, familyId));
    
    res.json(choresList);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero faccende' });
  }
});

// CREATE CHORE
router.post('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const { title, description, difficulty, points, estimatedMinutes, assignedTo, dueDate, recurrenceRule } = req.body;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [chore] = await db.insert(chores).values({
      familyId,
      title,
      description,
      difficulty: difficulty || 'medium',
      points: points || 10,
      estimatedMinutes,
      assignedTo,
      dueDate: dueDate ? new Date(dueDate) : null,
      recurrenceRule,
      createdBy: req.user!.userId,
    }).returning();
    
    broadcastToFamily(familyId, 'chore_created', chore);
    
    res.status(201).json(chore);
  } catch (error) {
    console.error('Create chore error:', error);
    res.status(500).json({ error: 'Errore nella creazione della faccenda' });
  }
});

// UPDATE CHORE
router.put('/:familyId/:choreId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const choreId = req.params.choreId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const updateData = { ...req.body, updatedAt: new Date() };
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    
    const [chore] = await db.update(chores)
      .set(updateData)
      .where(and(
        eq(chores.id, choreId),
        eq(chores.familyId, familyId)
      ))
      .returning();
    
    if (!chore) {
      return res.status(404).json({ error: 'Faccenda non trovata' });
    }
    
    broadcastToFamily(familyId, 'chore_updated', chore);
    
    res.json(chore);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

// COMPLETE CHORE
router.patch('/:familyId/:choreId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const choreId = req.params.choreId as string;
    
    const membership = await checkFamilyAccess(req.user!.userId, familyId);
    if (!membership) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [currentChore] = await db.select().from(chores).where(eq(chores.id, choreId)).limit(1);
    
    if (!currentChore) {
      return res.status(404).json({ error: 'Faccenda non trovata' });
    }
    
    if (currentChore.isCompleted) {
      return res.status(400).json({ error: 'Faccenda già completata' });
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
    res.status(500).json({ error: 'Errore nel completamento' });
  }
});

// DELETE CHORE
router.delete('/:familyId/:choreId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const choreId = req.params.choreId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.delete(chores)
      .where(and(
        eq(chores.id, choreId),
        eq(chores.familyId, familyId)
      ));
    
    broadcastToFamily(familyId, 'chore_deleted', { choreId });
    
    res.json({ message: 'Faccenda eliminata' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

export default router;
