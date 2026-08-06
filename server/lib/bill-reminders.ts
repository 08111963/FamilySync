import { db } from '../db';
import {
  bills,
  billReminderLog,
  familyMembers,
  users,
} from '../../shared/schema';
import { and, eq, ne } from 'drizzle-orm';
import { logger } from './logger';
import { sendBillReminderEmail, isEmailConfigured } from './email';
import { sendPushToFamily } from './push';
import { startDurableScheduler, latestWindowOpeningInRome } from './scheduled-jobs';

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

type ReminderKind = 'due_tomorrow' | 'due_today';

/**
 * Registra il promemoria in modo atomico: se un'altra istanza l'ha già
 * inviato (vincolo UNIQUE), restituisce false e non si invia nulla.
 */
async function claimReminder(billId: string, kind: ReminderKind): Promise<boolean> {
  const inserted = await db
    .insert(billReminderLog)
    .values({ billId, kind })
    .onConflictDoNothing()
    .returning({ id: billReminderLog.id });
  return inserted.length > 0;
}

/**
 * Rilascia il claim se l'invio è fallito del tutto: al prossimo giro dello
 * scheduler il promemoria verrà ritentato (altrimenti andrebbe perso per
 * sempre a causa del vincolo UNIQUE).
 */
async function releaseReminder(billId: string, kind: ReminderKind): Promise<void> {
  try {
    await db
      .delete(billReminderLog)
      .where(and(eq(billReminderLog.billId, billId), eq(billReminderLog.kind, kind)));
  } catch (err) {
    logger.error('Bill reminder release failed', { billId, error: String(err) });
  }
}

async function processKind(kind: ReminderKind, dueDate: string): Promise<void> {
  const dueBills = await db
    .select()
    .from(bills)
    .where(and(
      eq(bills.dueDate, dueDate),
      eq(bills.remindersEnabled, true),
      ne(bills.status, 'pagata'),
    ));

  for (const bill of dueBills) {
    try {
      const claimed = await claimReminder(bill.id, kind);
      if (!claimed) continue;

      const whenText = kind === 'due_today' ? 'scade oggi' : 'scade domani';
      const title = kind === 'due_today' ? 'Bolletta in scadenza oggi' : 'Bolletta in scadenza domani';
      const body = `"${bill.title}" di € ${bill.amount} ${whenText} (${formatDateIt(bill.dueDate)})`;

      try {
        // Scelta del proprietario (ago 2026): bollette, eventi e tutte le
        // notifiche arrivano SEMPRE a tutta la famiglia — niente destinatari
        // mirati. Push (nativo + web): errori già gestiti/loggati dentro.
        await sendPushToFamily(bill.familyId, {
          title,
          body,
          data: { type: 'bill_reminder', billId: bill.id },
        });

        // Email a tutti i membri con email verificata.
        if (isEmailConfigured()) {
          const members = await db
            .select({ email: users.email, name: users.name, emailVerified: users.emailVerified })
            .from(familyMembers)
            .innerJoin(users, eq(users.id, familyMembers.userId))
            .where(eq(familyMembers.familyId, bill.familyId));

          const recipients = members.filter((m) => m.email && m.emailVerified);
          let sent = 0;
          for (const m of recipients) {
            try {
              await sendBillReminderEmail({
                to: m.email!,
                recipientName: m.name || 'famiglia',
                billTitle: bill.title,
                amount: String(bill.amount),
                dueDate: formatDateIt(bill.dueDate),
                kind,
              });
              sent++;
            } catch (err) {
              logger.error('Bill reminder email failed', { billId: bill.id, error: String(err) });
            }
          }

          // Se NESSUNA email è partita (guasto provider), rilascia il claim
          // così il promemoria viene ritentato al prossimo giro. Le push
          // potrebbero ripetersi: meglio un doppione che un promemoria perso.
          if (recipients.length > 0 && sent === 0) {
            await releaseReminder(bill.id, kind);
          }
        }
      } catch (err) {
        // Errore imprevisto durante l'invio: rilascia il claim per ritentare.
        logger.error('Bill reminder send failed, will retry', { billId: bill.id, error: String(err) });
        await releaseReminder(bill.id, kind);
      }
    } catch (err) {
      logger.error('Bill reminder processing failed', { billId: bill.id, error: String(err) });
    }
  }
}

/** Ora corrente (0-23) nel fuso orario italiano. */
function hourInRome(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false })
      .format(new Date()),
  );
}

// Fasce orarie di invio (ora italiana): mai notifiche di notte.
// "Scade oggi" parte al mattino; "scade domani" la sera prima.
export const DUE_TODAY_WINDOW = { from: 7, to: 21 } as const;
export const DUE_TOMORROW_WINDOW = { from: 17, to: 21 } as const;

/**
 * Un singolo passaggio dello scheduler (esportato per i test; `hourOverride`
 * serve solo ai test per simulare l'ora italiana).
 */
export async function runBillRemindersOnce(hourOverride?: number): Promise<void> {
  const hour = hourOverride ?? hourInRome();
  const today = todayInRome();
  if (hour >= DUE_TODAY_WINDOW.from && hour <= DUE_TODAY_WINDOW.to) {
    await processKind('due_today', today);
  }
  if (hour >= DUE_TOMORROW_WINDOW.from && hour <= DUE_TOMORROW_WINDOW.to) {
    await processKind('due_tomorrow', addDays(today, 1));
  }
}

/** Nome del job nella tabella scheduled_job_runs. */
export const BILL_REMINDERS_JOB_NAME = 'bill_reminders_hourly';

/**
 * Finestra minima tra due run: poco meno dell'intervallo di poll, così la
 * cadenza resta davvero oraria anche se i tick arrivano con qualche secondo
 * di ritardo (altrimenti un tick su due verrebbe scartato).
 */
export const BILL_REMINDERS_MIN_INTERVAL_MS = 50 * 60 * 1000;

/**
 * Avvia lo scheduler dei promemoria bollette: un controllo subito dopo l'avvio
 * (catch-up dopo i riavvii autoscale) e poi ogni ora. Il "quando è partito
 * l'ultimo run" è persistito su DB (scheduled_job_runs) con claim atomico:
 * se l'istanza si spegne tra un tick e l'altro, la prima istanza che riparte
 * recupera subito il giro perso. Il dedup per-bolletta resta la garanzia
 * anti-doppioni (bill_reminder_log, sicuro anche con più istanze).
 */
export function startBillReminderScheduler(): void {
  startDurableScheduler({
    jobName: BILL_REMINDERS_JOB_NAME,
    minIntervalMs: BILL_REMINDERS_MIN_INTERVAL_MS,
    pollIntervalMs: CHECK_INTERVAL_MS,
    // Primo giro dopo 30 secondi (lascia respirare l'avvio del server).
    firstRunDelayMs: 30 * 1000,
    // Recupero al boot: se l'ultimo run è precedente all'apertura della
    // fascia corrente (7:00 today / 17:00 tomorrow), il claim riesce anche
    // dentro la finestra minima — caso autoscale "tick 6:51, boot 7:15".
    catchUpBoundary: () =>
      latestWindowOpeningInRome([DUE_TODAY_WINDOW.from, DUE_TOMORROW_WINDOW.from]),
    run: runBillRemindersOnce,
  });
}
