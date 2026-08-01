import { db } from '../db';
import {
  calendarEvents,
  eventReminderLog,
  familyMembers,
  users,
} from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from './logger';
import { sendEventReminderEmail, isEmailConfigured } from './email';
import { sendPushToFamily } from './push';
import { getBlockRelatedUserIds } from './block-filter';

const TZ = 'Europe/Rome';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // ogni ora

/** Data odierna in formato ISO (AAAA-MM-GG) nel fuso orario italiano. */
function todayInRome(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** Aggiunge N giorni a una data ISO (AAAA-MM-GG). */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Formatta una data ISO in italiano (es. "23 luglio 2026"). */
function formatDateIt(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

type ReminderKind = 'event_tomorrow' | 'event_today';

/**
 * Registra il promemoria in modo atomico: se un'altra istanza l'ha già
 * inviato (vincolo UNIQUE), restituisce false e non si invia nulla.
 */
async function claimReminder(eventId: string, kind: ReminderKind): Promise<boolean> {
  const inserted = await db
    .insert(eventReminderLog)
    .values({ eventId, kind })
    .onConflictDoNothing()
    .returning({ id: eventReminderLog.id });
  return inserted.length > 0;
}

/**
 * Rilascia il claim se l'invio è fallito del tutto: al prossimo giro dello
 * scheduler il promemoria verrà ritentato (altrimenti andrebbe perso per
 * sempre a causa del vincolo UNIQUE).
 */
async function releaseReminder(eventId: string, kind: ReminderKind): Promise<void> {
  try {
    await db
      .delete(eventReminderLog)
      .where(and(eq(eventReminderLog.eventId, eventId), eq(eventReminderLog.kind, kind)));
  } catch (err) {
    logger.error('Event reminder release failed', { eventId, error: String(err) });
  }
}

async function processKind(kind: ReminderKind, date: string): Promise<void> {
  const events = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.date, date));

  for (const event of events) {
    try {
      const claimed = await claimReminder(event.id, kind);
      if (!claimed) continue;

      // Utenti in blocco reciproco con l'autore dell'evento: né push né email.
      const blockRelated = new Set(
        await getBlockRelatedUserIds(event.createdBy, event.familyId),
      );

      const whenText = kind === 'event_today' ? 'è oggi' : 'è domani';
      const title = kind === 'event_today' ? 'Evento oggi' : 'Evento domani';
      const timeText = !event.allDay && event.time ? ` alle ${event.time}` : '';
      const body = `"${event.title}" ${whenText} (${formatDateIt(event.date)}${timeText})`;

      try {
        // Push (nativo + web) alla famiglia, esclusi gli utenti in blocco —
        // gli errori interni sono già gestiti/loggati dentro sendPushToFamily.
        await sendPushToFamily(event.familyId, {
          title,
          body,
          data: { type: 'event_reminder', eventId: event.id },
        }, { excludeUserIds: blockRelated });

        // Email ai membri con email verificata (esclusi utenti in blocco).
        if (isEmailConfigured()) {
          const members = await db
            .select({
              userId: familyMembers.userId,
              email: users.email,
              name: users.name,
              emailVerified: users.emailVerified,
            })
            .from(familyMembers)
            .innerJoin(users, eq(users.id, familyMembers.userId))
            .where(eq(familyMembers.familyId, event.familyId));

          const recipients = members.filter(
            (m) => m.email && m.emailVerified && !blockRelated.has(m.userId),
          );
          let sent = 0;
          for (const m of recipients) {
            try {
              await sendEventReminderEmail({
                to: m.email!,
                recipientName: m.name || 'famiglia',
                eventTitle: event.title,
                eventDate: formatDateIt(event.date),
                eventTime: !event.allDay ? event.time : null,
                location: event.location,
                kind,
              });
              sent++;
            } catch (err) {
              logger.error('Event reminder email failed', { eventId: event.id, error: String(err) });
            }
          }

          // Se NESSUNA email è partita (guasto provider), rilascia il claim
          // così il promemoria viene ritentato al prossimo giro. Le push
          // potrebbero ripetersi: meglio un doppione che un promemoria perso.
          if (recipients.length > 0 && sent === 0) {
            await releaseReminder(event.id, kind);
          }
        }
      } catch (err) {
        // Errore imprevisto durante l'invio: rilascia il claim per ritentare.
        logger.error('Event reminder send failed, will retry', { eventId: event.id, error: String(err) });
        await releaseReminder(event.id, kind);
      }
    } catch (err) {
      logger.error('Event reminder processing failed', { eventId: event.id, error: String(err) });
    }
  }
}

/** Un singolo passaggio dello scheduler (esportato per i test). */
export async function runEventRemindersOnce(): Promise<void> {
  const today = todayInRome();
  await processKind('event_today', today);
  await processKind('event_tomorrow', addDays(today, 1));
}

/**
 * Avvia lo scheduler dei promemoria eventi: un controllo subito dopo l'avvio
 * e poi ogni ora. Deduplica via event_reminder_log (sicuro anche con più istanze).
 */
export function startEventReminderScheduler(): void {
  const run = () => {
    runEventRemindersOnce().catch((err) =>
      logger.error('Event reminder scheduler error', { error: String(err) }),
    );
  };
  // Primo giro dopo 45 secondi (lascia respirare l'avvio del server).
  setTimeout(run, 45 * 1000);
  const timer = setInterval(run, CHECK_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}
