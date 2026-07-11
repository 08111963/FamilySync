import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { calendarEvents, eventPushLog, familyMembers } from '../../shared/schema';
import { sendPushToUser } from './push';
import { logger } from './logger';
import { zonedTimeToUtc, PUSH_TZ, CATCH_UP_WINDOW_MS } from './bill-push';

/**
 * PUSH PROMEMORIA EVENTI (lato server)
 *
 * Stesso metodo dei promemoria bollette: lo scheduler controlla ogni minuto
 * quali promemoria sono arrivati al loro orario e li invia via push a TUTTI
 * i membri della famiglia, anche con l'app chiusa.
 *
 * Regole:
 * - Evento con orario: promemoria 30 minuti prima dell'inizio.
 * - Evento senza orario / tutto il giorno: promemoria alle 08:00 del giorno.
 *
 * Anti-doppione: claim atomico in event_push_log (chiave unica
 * eventId+reminderKey); se l'invio fallisce per tutti, il claim viene
 * annullato e si ritenta al giro successivo.
 */

/** Minuti di anticipo per gli eventi con orario. */
const LEAD_MINUTES = 30;

/** Ora del promemoria per eventi senza orario (giorno stesso). */
const ALL_DAY_HOUR = 8;

interface PushableEvent {
  id: string;
  title: string;
  date: string; // "AAAA-MM-GG"
  time: string | null; // "HH:MM" oppure null
  allDay: boolean | null;
  location: string | null;
}

export interface DueEventPush {
  reminderKey: string;
  fireAt: Date;
  title: string;
  body: string;
}

/**
 * Promemoria di un evento che DEVE partire adesso: orario previsto già
 * raggiunto ma non più vecchio della finestra di recupero.
 */
export function computeDueEventPushes(
  event: PushableEvent,
  now: Date,
  timeZone: string = PUSH_TZ,
  catchUpWindowMs: number = CATCH_UP_WINDOW_MS
): DueEventPush[] {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.date);
  if (!dm) return [];
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);

  const tm = event.time ? /^(\d{2}):(\d{2})$/.exec(event.time) : null;
  const timeValid = !!tm && Number(tm[1]) <= 23 && Number(tm[2]) <= 59;
  const hasTime = timeValid && !event.allDay;

  let fireAt: Date;
  let title: string;
  let body: string;
  let reminderKey: string;

  const locationSuffix = event.location ? ` · ${event.location}` : '';

  if (hasTime) {
    const startAt = zonedTimeToUtc(year, month, day, Number(tm![1]), Number(tm![2]), timeZone);
    fireAt = new Date(startAt.getTime() - LEAD_MINUTES * 60 * 1000);
    title = `Evento tra ${LEAD_MINUTES} minuti`;
    body = `${event.title} · alle ${event.time}${locationSuffix}`;
    reminderKey = `start-${LEAD_MINUTES}m:${event.date}T${event.time}`;
  } else {
    fireAt = zonedTimeToUtc(year, month, day, ALL_DAY_HOUR, 0, timeZone);
    title = 'Evento di oggi';
    body = `${event.title} · oggi${locationSuffix}`;
    reminderKey = `allday:${event.date}`;
  }

  const t = fireAt.getTime();
  const nowMs = now.getTime();
  if (t > nowMs || nowMs - t > catchUpWindowMs) return [];

  return [{ reminderKey, fireAt, title, body }];
}

/** Formatta una data UTC come "AAAA-MM-GG" nel fuso dato. */
function isoDateInTz(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(instant); // en-CA produce "YYYY-MM-DD"
}

/**
 * Un giro dello scheduler per gli eventi: trova i promemoria da inviare
 * adesso, li prenota nel log e li invia a tutti i membri della famiglia.
 */
export async function runEventPushTick(now: Date = new Date()): Promise<number> {
  // Solo gli eventi di ieri/oggi/domani: la finestra di invio è di pochi
  // minuti, il resto è rumore (il confronto lessicografico su "AAAA-MM-GG"
  // è corretto).
  const DAY_MS = 24 * 60 * 60 * 1000;
  const minDate = isoDateInTz(new Date(now.getTime() - DAY_MS), PUSH_TZ);
  const maxDate = isoDateInTz(new Date(now.getTime() + DAY_MS), PUSH_TZ);

  const candidates = await db
    .select({
      id: calendarEvents.id,
      familyId: calendarEvents.familyId,
      title: calendarEvents.title,
      date: calendarEvents.date,
      time: calendarEvents.time,
      allDay: calendarEvents.allDay,
      location: calendarEvents.location,
    })
    .from(calendarEvents)
    .where(and(gte(calendarEvents.date, minDate), lte(calendarEvents.date, maxDate)));

  if (candidates.length === 0) return 0;

  const membersCache = new Map<string, string[]>();
  let sentCount = 0;

  for (const event of candidates) {
    try {
      const dueList = computeDueEventPushes(event, now);
      if (dueList.length === 0) continue;

      let memberIds = membersCache.get(event.familyId);
      if (!memberIds) {
        const rows = await db
          .select({ userId: familyMembers.userId })
          .from(familyMembers)
          .where(eq(familyMembers.familyId, event.familyId));
        memberIds = rows.map((r) => r.userId).filter((id): id is string => !!id);
        membersCache.set(event.familyId, memberIds);
      }
      if (memberIds.length === 0) continue;

      for (const duePush of dueList) {
        const claimed = await db
          .insert(eventPushLog)
          .values({ eventId: event.id, reminderKey: duePush.reminderKey })
          .onConflictDoNothing()
          .returning({ id: eventPushLog.id });
        if (claimed.length === 0) continue;

        let anyDelivered = false;
        let anyFailure = false;
        for (const userId of memberIds) {
          const result = await sendPushToUser(userId, {
            title: duePush.title,
            body: duePush.body,
            data: { eventId: event.id, familyId: event.familyId, kind: 'event_reminder' },
          });
          if (result.delivered > 0) anyDelivered = true;
          if (!result.ok) anyFailure = true;
        }

        // Nessuno l'ha ricevuta e almeno un invio è fallito: annulla la
        // prenotazione, il prossimo giro ritenta (entro la finestra).
        if (!anyDelivered && anyFailure) {
          await db.delete(eventPushLog).where(eq(eventPushLog.id, claimed[0].id));
          logger.warn('Event push: invio fallito, verrà ritentato', {
            eventId: event.id,
            reminderKey: duePush.reminderKey,
          });
          continue;
        }
        sentCount++;
      }
    } catch (error) {
      logger.error('Event push tick: errore su un evento', {
        eventId: event.id,
        error: String(error),
      });
    }
  }

  return sentCount;
}
