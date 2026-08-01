import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getParam, getQuery } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { calendarEvents, familyMembers, families, users } from '../../shared/schema';
import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily, notifyUserInFamily } from '../lib/websocket';
import { sendPushToUser, sendPushToFamily } from '../lib/push';
import { getBlockedUserIds, getBlockRelatedUserIds, applyBlockedFilter } from '../lib/block-filter';
import { logger } from '../lib/logger';
import { reserveBaseSlot, baseLimitBody } from '../lib/base-usage';
import { sendNewEventEmail, isEmailConfigured } from '../lib/email';
import { parseRecurrenceRule, expandOccurrences, isRealIsoDate } from '../../shared/chore-recurrence';

/** Numero massimo di occorrenze materializzate per un evento ricorrente. */
const MAX_RECURRENCE_OCCURRENCES = 60;
/** Orizzonte massimo (in mesi) per la materializzazione delle occorrenze. */
const RECURRENCE_HORIZON_MONTHS = 6;

/** Formatta una data ISO (AAAA-MM-GG) in italiano (es. "23 luglio 2026"). */
function formatDateIt(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

async function notifyAssignedMember(
  familyId: string,
  event: typeof calendarEvents.$inferSelect,
  creatorUserId: string
) {
  try {
    if (!event.memberId) return;

    const [member] = await db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(eq(familyMembers.id, event.memberId))
      .limit(1);

    if (!member) return;
    if (member.userId === creatorUserId) return;

    const title = 'Nuovo evento assegnato';
    const body = event.time
      ? `${event.title} · ${event.date} alle ${event.time}`
      : `${event.title} · ${event.date}`;
    const data = { type: 'event_assigned', eventId: event.id, familyId };

    await notifyUserInFamily(familyId, member.userId, 'event_assigned', {
      title,
      body,
      event,
    });
    await sendPushToUser(member.userId, { title, body, data });
  } catch (error) {
    logger.error('notifyAssignedMember error', { error: String(error) });
  }
}

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional(),
  date: z.string().refine(isRealIsoDate, "Data non valida (formato AAAA-MM-GG)"),
  time: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional().default(false),
  category: z.enum(["work", "school", "sport", "health", "social", "family", "other"]).optional().default("other"),
  location: z.string().optional(),
  color: z.string().optional().default("#6366F1"),
  memberId: z.string().optional(),
  recurrenceRule: z.string().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  date: z.string().refine(isRealIsoDate, "Data non valida (formato AAAA-MM-GG)").optional(),
  time: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  category: z.enum(["work", "school", "sport", "health", "social", "family", "other"]).optional(),
  location: z.string().nullable().optional(),
  color: z.string().optional(),
  memberId: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
}).strict();

/** Base URL pubblica del backend (dietro proxy: trust proxy e' attivo). */
function feedBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * Restituisce l'URL del feed ICS della famiglia (lo genera al primo accesso).
 * Con ?regenerate=1 crea un nuovo token invalidando il link precedente.
 */
router.get('/:familyId/feed-url', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const regenerate = getQuery(req, 'regenerate') === '1';

    const [family] = await db
      .select({ icsFeedToken: families.icsFeedToken })
      .from(families)
      .where(eq(families.id, familyId))
      .limit(1);

    if (!family) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Famiglia non trovata' } });
    }

    let token = family.icsFeedToken;
    if (!token || regenerate) {
      token = randomBytes(24).toString('hex');
      await db.update(families)
        .set({ icsFeedToken: token, updatedAt: new Date() })
        .where(eq(families.id, familyId));
    }

    res.json({ url: `${feedBaseUrl(req)}/calendar-feed/${token}.ics` });
  } catch (error) {
    logger.error('Feed URL error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero del link calendario' } });
  }
});

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const startDate = getQuery(req, 'startDate');
    const endDate = getQuery(req, 'endDate');
    const blockedIds = await getBlockedUserIds(req.user!.userId, familyId);

    const conditions: any[] = [eq(calendarEvents.familyId, familyId)];
    if (startDate && endDate) {
      conditions.push(gte(calendarEvents.date, startDate));
      conditions.push(lte(calendarEvents.date, endDate));
    }
    const blockFilter = applyBlockedFilter(calendarEvents.createdBy, blockedIds);
    if (blockFilter) conditions.push(blockFilter);

    const events = await db.select().from(calendarEvents).where(and(...conditions));

    res.json(events);
  } catch (error) {
    logger.error('Get events error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero eventi" } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createEventSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    // Se c'è una regola di ricorrenza deve essere valida.
    if (parsed.data.recurrenceRule && !parseRecurrenceRule(parsed.data.recurrenceRule)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Regola di ricorrenza non valida" },
      });
    }

    const gate = await reserveBaseSlot(req.user!.userId, familyId, "calendar-event");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
    }

    // Eventi ricorrenti: materializziamo le occorrenze nei prossimi mesi
    // (una riga per data), così calendario, feed ICS e sync le vedono tutte.
    let dates: string[] = [parsed.data.date];
    if (parsed.data.recurrenceRule) {
      const until = new Date(`${parsed.data.date.slice(0, 10)}T00:00:00Z`);
      until.setUTCMonth(until.getUTCMonth() + RECURRENCE_HORIZON_MONTHS);
      const expanded = expandOccurrences(
        parsed.data.recurrenceRule,
        parsed.data.date.slice(0, 10),
        until.toISOString().slice(0, 10),
        MAX_RECURRENCE_OCCURRENCES
      );
      if (expanded.length > 0) dates = expanded;
    }

    // Le occorrenze della stessa serie ricorrente condividono un seriesId,
    // così "elimina tutta la serie" è univoco anche con titoli uguali.
    const seriesId = parsed.data.recurrenceRule ? randomUUID() : null;

    const inserted = await db.insert(calendarEvents).values(
      dates.map((date) => ({
        familyId,
        ...parsed.data,
        date,
        seriesId,
        createdBy: req.user!.userId,
      }))
    ).returning();

    const event = inserted[0]!;
    // Un solo broadcast anche per gli eventi ricorrenti: i client ricaricano
    // comunque l'intera lista (una raffica di 50+ messaggi faceva scattare il
    // rate limiter globale e il calendario restava vuoto).
    broadcastToFamily(familyId, 'event_created', event);
    void notifyAssignedMember(familyId, event, req.user!.userId);

    // Push agli altri membri della famiglia (l'assegnatario riceve già la sua
    // notifica dedicata; esclusi anche gli utenti in blocco reciproco col creatore).
    void (async () => {
      const creatorId = req.user!.userId;
      const excluded = new Set<string>(await getBlockRelatedUserIds(creatorId, familyId));
      excluded.add(creatorId);
      if (event.memberId) {
        const [assignee] = await db
          .select({ userId: familyMembers.userId })
          .from(familyMembers)
          .where(eq(familyMembers.id, event.memberId))
          .limit(1);
        if (assignee) excluded.add(assignee.userId);
      }
      const body = event.time
        ? `${event.title} · ${event.date} alle ${event.time}`
        : `${event.title} · ${event.date}`;
      await sendPushToFamily(familyId, {
        title: 'Nuovo evento in calendario',
        body,
        data: { route: '/(tabs)/calendar' },
      }, { excludeUserIds: excluded });
    })().catch(() => {});

    // Email agli ALTRI membri con email verificata (mai all'autore, esclusi
    // gli utenti in blocco reciproco). UNA sola email anche per le serie
    // ricorrenti: l'inserimento della serie avviene in questa singola POST.
    void (async () => {
      if (!isEmailConfigured()) return;
      const creatorId = req.user!.userId;
      const blockRelated = new Set<string>(await getBlockRelatedUserIds(creatorId, familyId));

      const members = await db
        .select({
          userId: familyMembers.userId,
          email: users.email,
          name: users.name,
          emailVerified: users.emailVerified,
        })
        .from(familyMembers)
        .innerJoin(users, eq(users.id, familyMembers.userId))
        .where(eq(familyMembers.familyId, familyId));

      const creatorName =
        members.find((m) => m.userId === creatorId)?.name || 'Un membro della famiglia';
      const recipients = members.filter(
        (m) => m.userId !== creatorId && m.email && m.emailVerified && !blockRelated.has(m.userId),
      );

      for (const m of recipients) {
        try {
          await sendNewEventEmail({
            to: m.email!,
            recipientName: m.name || 'famiglia',
            creatorName,
            eventTitle: event.title,
            eventDate: formatDateIt(event.date),
            eventTime: !event.allDay ? event.time : null,
            location: event.location,
            isRecurring: Boolean(event.recurrenceRule),
          });
        } catch (err) {
          logger.error('New event email failed', { eventId: event.id, error: String(err) });
        }
      }
    })().catch((err) => {
      logger.error('New event email fanout failed', { error: String(err) });
    });

    res.status(201).json(event);
  } catch (error) {
    logger.error('Create event error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'evento" } });
  }
});

router.put('/:familyId/:eventId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const eventId = getParam(req, 'eventId');

    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.recurrenceRule && !parseRecurrenceRule(parsed.data.recurrenceRule)) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Regola di ricorrenza non valida" },
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
    const familyId = getParam(req, 'familyId');
    const eventId = getParam(req, 'eventId');
    const scope = getQuery(req, 'scope');

    const [deleted] = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.familyId, familyId)))
      .returning();

    // Se richiesto, elimina anche tutte le altre occorrenze della stessa serie.
    if (scope === 'series' && deleted?.recurrenceRule) {
      if (deleted.seriesId) {
        // Serie nuove: identificate in modo univoco dal seriesId.
        await db.delete(calendarEvents).where(
          and(
            eq(calendarEvents.familyId, familyId),
            eq(calendarEvents.seriesId, deleted.seriesId),
          ),
        );
      } else {
        // Serie create prima dell'introduzione del seriesId: fallback sui campi
        // discriminanti disponibili (titolo, regola, orario, creatore).
        const conditions = [
          eq(calendarEvents.familyId, familyId),
          eq(calendarEvents.title, deleted.title),
          eq(calendarEvents.recurrenceRule, deleted.recurrenceRule),
          eq(calendarEvents.createdBy, deleted.createdBy),
          isNull(calendarEvents.seriesId),
          deleted.time === null ? isNull(calendarEvents.time) : eq(calendarEvents.time, deleted.time),
        ];
        await db.delete(calendarEvents).where(and(...conditions));
      }
    }

    broadcastToFamily(familyId, 'event_deleted', { eventId, scope: scope === 'series' ? 'series' : 'single' });
    res.json({ message: 'Evento eliminato' });
  } catch (error) {
    logger.error('Delete event error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
