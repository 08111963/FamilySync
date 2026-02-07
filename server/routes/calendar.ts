import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { calendarEvents } from '../../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional(),
  date: z.string().min(1, "La data è obbligatoria"),
  time: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional().default(false),
  category: z.string().optional().default("other"),
  location: z.string().optional(),
  color: z.string().optional().default("#6366F1"),
  memberId: z.string().optional(),
  recurrenceRule: z.string().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  time: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  category: z.string().optional(),
  location: z.string().nullable().optional(),
  color: z.string().optional(),
  memberId: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
}).strict();

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const { startDate, endDate } = req.query;

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
    logger.error('Get events error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero eventi" } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const parsed = createEventSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [event] = await db.insert(calendarEvents).values({
      familyId,
      ...parsed.data,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'event_created', event);
    res.status(201).json(event);
  } catch (error) {
    logger.error('Create event error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'evento" } });
  }
});

router.put('/:familyId/:eventId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, eventId } = req.params;

    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [event] = await db.update(calendarEvents)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.familyId, familyId)))
      .returning();

    if (!event) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Evento non trovato" } });
    }

    broadcastToFamily(familyId, 'event_updated', event);
    res.json(event);
  } catch (error) {
    logger.error('Update event error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});

router.delete('/:familyId/:eventId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, eventId } = req.params;

    await db.delete(calendarEvents).where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.familyId, familyId)));

    broadcastToFamily(familyId, 'event_deleted', { eventId });
    res.json({ message: 'Evento eliminato' });
  } catch (error) {
    logger.error('Delete event error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
