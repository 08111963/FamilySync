import { db } from '../db';
import {
  bills,
  billReminderLog,
  billSplits,
  familyMembers,
  users,
} from '../../shared/schema';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { logger } from './logger';
import { sendBillReminderEmail, isEmailConfigured } from './email';
import { sendPushToFamily, sendPushToUser } from './push';
import { startDurableScheduler } from './scheduled-jobs';

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
        // Destinatari mirati: responsabile della bolletta + membri con una
        // quota nella ripartizione. Se nessuno dei due è impostato, il
        // promemoria va a tutta la famiglia (comportamento precedente).
        const involvedMemberIds = new Set<string>();
        if (bill.assignedTo) involvedMemberIds.add(bill.assignedTo);
        const splits = await db
          .select({ memberId: billSplits.memberId })
          .from(billSplits)
          .where(eq(billSplits.billId, bill.id));
        for (const s of splits) involvedMemberIds.add(s.memberId);

        // Mappa membro -> account: i profili bambino (userId NULL) non hanno
        // account da notificare e vengono saltati.
        let targetUserIds: string[] | null = null;
        if (involvedMemberIds.size > 0) {
          const involvedMembers = await db
            .select({ userId: familyMembers.userId })
            .from(familyMembers)
            .where(and(
              inArray(familyMembers.id, Array.from(involvedMemberIds)),
              // Difesa in profondità: mai mappare membri di un'altra famiglia.
              eq(familyMembers.familyId, bill.familyId),
            ));
          const ids = involvedMembers
            .map((m) => m.userId)
            .filter((id): id is string => id !== null);
          // Solo profili bambino coinvolti (nessun account): avvisa i genitori
          // ricadendo su tutta la famiglia, altrimenti il promemoria si perde.
          if (ids.length > 0) targetUserIds = Array.from(new Set(ids));
        }

        // Push (nativo + web): solo ai coinvolti, o a tutta la famiglia come
        // fallback — gli errori interni sono già gestiti/loggati.
        const payload = { title, body, data: { type: 'bill_reminder', billId: bill.id } };
        if (targetUserIds) {
          await Promise.all(targetUserIds.map((uid) => sendPushToUser(uid, payload)));
        } else {
          await sendPushToFamily(bill.familyId, payload);
        }

        // Email ai membri con email verificata (stessi destinatari delle push).
        if (isEmailConfigured()) {
          const members = await db
            .select({ userId: familyMembers.userId, email: users.email, name: users.name, emailVerified: users.emailVerified })
            .from(familyMembers)
            .innerJoin(users, eq(users.id, familyMembers.userId))
            .where(eq(familyMembers.familyId, bill.familyId));

          const targetSet = targetUserIds ? new Set(targetUserIds) : null;
          const recipients = members.filter(
            (m) => m.email && m.emailVerified && (!targetSet || (m.userId && targetSet.has(m.userId))),
          );
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
    run: runBillRemindersOnce,
  });
}
