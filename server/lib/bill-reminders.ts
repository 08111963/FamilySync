import { db } from '../db';
import {
  bills,
  billReminderLog,
  familyMembers,
  users,
} from '../../shared/schema';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { logger } from './logger';
import { sendBillReminderEmail, isEmailConfigured } from './email';
import { sendPushToFamily } from './push';

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
        // Push (nativo + web) a tutta la famiglia — gli errori interni sono
        // già gestiti/loggati dentro sendPushToFamily.
        await sendPushToFamily(bill.familyId, {
          title,
          body,
          data: { type: 'bill_reminder', billId: bill.id },
        });

        // Email ai membri con email verificata.
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

/** Un singolo passaggio dello scheduler (esportato per i test). */
export async function runBillRemindersOnce(): Promise<void> {
  const today = todayInRome();
  await processKind('due_today', today);
  await processKind('due_tomorrow', addDays(today, 1));
}

/**
 * Avvia lo scheduler dei promemoria bollette: un controllo subito dopo l'avvio
 * e poi ogni ora. Deduplica via bill_reminder_log (sicuro anche con più istanze).
 */
export function startBillReminderScheduler(): void {
  const run = () => {
    runBillRemindersOnce().catch((err) =>
      logger.error('Bill reminder scheduler error', { error: String(err) }),
    );
  };
  // Primo giro dopo 30 secondi (lascia respirare l'avvio del server).
  setTimeout(run, 30 * 1000);
  const timer = setInterval(run, CHECK_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}
