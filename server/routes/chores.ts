import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { chores, familyMembers, calendarEvents } from '../../shared/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
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

// --- Sincronizzazione con il calendario famiglia ---------------------------
// Ogni faccenda con scadenza (e non completata) ha un evento tutto-il-giorno
// alla data di scadenza, cosi' compare nel calendario dell'app, nel feed ICS
// (Google/Apple Calendar) e puo' essere salvata sul telefono. L'evento viene
// aggiornato se cambia la faccenda e rimosso al completamento/eliminazione.
// Gli errori di sync non bloccano mai l'operazione principale (best-effort).

const CHORE_EVENT_COLOR = '#8B5CF6';

function choreEventFields(chore: typeof chores.$inferSelect) {
  const parts: string[] = [];
  if (chore.description) parts.push(chore.description);
  if (chore.points) parts.push(`Punti: ${chore.points}`);
  parts.push('Creato automaticamente dalla sezione Faccende');
  return {
    title: `Faccenda: ${chore.title}`,
    description: parts.join('\n'),
    date: chore.dueDate!.toISOString().split('T')[0]!,
    time: null as string | null,
    endTime: null as string | null,
    allDay: true,
    category: 'other' as const,
    color: CHORE_EVENT_COLOR,
    memberId: chore.assignedTo,
  };
}

/** Crea l'evento calendario per una faccenda e collega chores.calendarEventId. */
async function createChoreCalendarEvent(
  chore: typeof chores.$inferSelect,
  userId: string
): Promise<typeof chores.$inferSelect> {
  if (!chore.dueDate || chore.isCompleted) return chore;
  try {
    const [event] = await db
      .insert(calendarEvents)
      .values({
        familyId: chore.familyId,
        ...choreEventFields(chore),
        createdBy: userId,
      })
      .returning();
    // Check-and-set atomico: collega l'evento solo se la faccenda non ne ha
    // gia' uno (richieste concorrenti non devono creare eventi duplicati).
    const [updated] = await db
      .update(chores)
      .set({ calendarEventId: event.id })
      .where(and(eq(chores.id, chore.id), isNull(chores.calendarEventId)))
      .returning();
    if (!updated) {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, event.id));
      const [current] = await db.select().from(chores).where(eq(chores.id, chore.id)).limit(1);
      return current ?? chore;
    }
    broadcastToFamily(chore.familyId, 'event_created', event);
    return updated;
  } catch (error) {
    logger.warn('Chore calendar sync (create) failed', { choreId: chore.id, error: String(error) });
    return chore;
  }
}

/** Aggiorna l'evento calendario collegato (titolo/data/descrizione/assegnatario). */
async function updateChoreCalendarEvent(chore: typeof chores.$inferSelect): Promise<void> {
  if (!chore.calendarEventId || !chore.dueDate) return;
  try {
    const [event] = await db
      .update(calendarEvents)
      .set({ ...choreEventFields(chore), updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, chore.calendarEventId), eq(calendarEvents.familyId, chore.familyId)))
      .returning();
    if (event) broadcastToFamily(chore.familyId, 'event_updated', event);
  } catch (error) {
    logger.warn('Chore calendar sync (update) failed', { choreId: chore.id, error: String(error) });
  }
}

/** Elimina l'evento calendario collegato (faccenda completata o eliminata). */
async function deleteChoreCalendarEvent(
  familyId: string,
  choreId: string,
  calendarEventId: string | null
): Promise<void> {
  if (!calendarEventId) return;
  try {
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, calendarEventId), eq(calendarEvents.familyId, familyId)));
    await db.update(chores).set({ calendarEventId: null }).where(eq(chores.id, choreId));
    broadcastToFamily(familyId, 'event_deleted', { eventId: calendarEventId });
  } catch (error) {
    logger.warn('Chore calendar sync (delete) failed', { choreId, error: String(error) });
  }
}

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
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
    const familyId = getParam(req, 'familyId');
    const parsed = createChoreSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    let [chore] = await db.insert(chores).values({
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

    // Sync calendario: la faccenda con scadenza compare anche nel calendario.
    chore = await createChoreCalendarEvent(chore, req.user!.userId);

    broadcastToFamily(familyId, 'chore_created', chore);
    res.status(201).json(chore);
  } catch (error) {
    logger.error('Create chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della faccenda" } });
  }
});

router.put('/:familyId/:choreId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

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

    let [chore] = await db.update(chores)
      .set(updateData)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    if (!chore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    // Sync calendario: evento presente solo se c'e' scadenza e non completata.
    if (chore.isCompleted || !chore.dueDate) {
      await deleteChoreCalendarEvent(familyId, chore.id, chore.calendarEventId);
      chore = { ...chore, calendarEventId: null };
    } else if (chore.calendarEventId) {
      await updateChoreCalendarEvent(chore);
    } else {
      chore = await createChoreCalendarEvent(chore, req.user!.userId);
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
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

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

    let [chore] = await db.update(chores)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    // Sync calendario: faccenda completata → evento rimosso.
    await deleteChoreCalendarEvent(familyId, choreId, chore.calendarEventId);
    chore = { ...chore, calendarEventId: null };

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
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

    const [deleted] = await db.delete(chores)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    // Sync calendario: faccenda eliminata → evento rimosso (best-effort).
    if (deleted?.calendarEventId) {
      try {
        await db.delete(calendarEvents)
          .where(and(eq(calendarEvents.id, deleted.calendarEventId), eq(calendarEvents.familyId, familyId)));
        broadcastToFamily(familyId, 'event_deleted', { eventId: deleted.calendarEventId });
      } catch (error) {
        logger.warn('Chore calendar sync (delete) failed', { choreId, error: String(error) });
      }
    }

    broadcastToFamily(familyId, 'chore_deleted', { choreId });
    res.json({ message: 'Faccenda eliminata' });
  } catch (error) {
    logger.error('Delete chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
