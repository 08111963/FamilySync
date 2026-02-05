import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { calendarEvents, familyMembers } from '../../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
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
  return membership.length > 0;
}

// GET EVENTS
router.get('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const { startDate, endDate } = req.query;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    let events;
    if (startDate && endDate) {
      events = await db.select().from(calendarEvents).where(and(
        eq(calendarEvents.familyId, familyId),
        gte(calendarEvents.date, startDate as string),
        lte(calendarEvents.date, endDate as string)
      ));
    } else {
      events = await db.select().from(calendarEvents).where(eq(calendarEvents.familyId, familyId));
    }
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero eventi' });
  }
});

// CREATE EVENT
router.post('/:familyId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const { title, description, date, time, endTime, allDay, category, location, color, memberId, recurrenceRule } = req.body;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [event] = await db.insert(calendarEvents).values({
      familyId,
      title,
      description,
      date,
      time,
      endTime,
      allDay: allDay || false,
      category: category || 'other',
      location,
      color: color || '#6366F1',
      memberId,
      recurrenceRule,
      createdBy: req.user!.userId,
    }).returning();
    
    broadcastToFamily(familyId, 'event_created', event);
    
    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Errore nella creazione dell\'evento' });
  }
});

// UPDATE EVENT
router.put('/:familyId/:eventId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const eventId = req.params.eventId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [event] = await db.update(calendarEvents)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.familyId, familyId)
      ))
      .returning();
    
    if (!event) {
      return res.status(404).json({ error: 'Evento non trovato' });
    }
    
    broadcastToFamily(familyId, 'event_updated', event);
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

// DELETE EVENT
router.delete('/:familyId/:eventId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const eventId = req.params.eventId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.delete(calendarEvents)
      .where(and(
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.familyId, familyId)
      ));
    
    broadcastToFamily(familyId, 'event_deleted', { eventId });
    
    res.json({ message: 'Evento eliminato' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

export default router;
