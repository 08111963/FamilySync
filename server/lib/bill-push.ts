import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db';
import { bills, billPushLog, familyMembers } from '../../shared/schema';
import { getPlanForFamily } from './entitlements';
import { sendPushToUser } from './push';
import { logger } from './logger';
import {
  NOTIFY_HOUR,
  formatDueLabel,
  formatEuro,
  normalizeCustomReminderDates,
  offsetsForPlan,
  titleForOffset,
  type BillPlan,
} from '../../lib/bill-notifications';

/**
 * PUSH PROMEMORIA BOLLETTE (lato server)
 *
 * Le notifiche locali del telefono funzionano solo sul dispositivo che ha
 * aperto l'app di recente. Questo modulo invia invece i promemoria via push
 * dal server a TUTTI i membri della famiglia, all'orario previsto, anche se
 * nessuno ha l'app aperta.
 *
 * La logica (offset per piano, ora 08:00, promemoria personalizzati con ora)
 * è la STESSA di lib/bill-notifications.ts, ma qui i calcoli usano il fuso
 * orario della famiglia (default Europe/Rome) perché il server gira in UTC.
 *
 * Anti-doppione: ogni invio viene "prenotato" con un INSERT nella tabella
 * bill_push_log (chiave unica billId+reminderKey, ON CONFLICT DO NOTHING):
 * il promemoria parte solo se la prenotazione riesce, quindi mai due volte.
 */

export const PUSH_TZ = process.env.PUSH_TZ || 'Europe/Rome';

/** Quanto tempo dopo l'orario previsto un promemoria può ancora partire
 *  (recupero dopo riavvii o server temporaneamente non attivo). */
export const CATCH_UP_WINDOW_MS = 30 * 60 * 1000;

/** Offset (ms) del fuso orario `timeZone` rispetto a UTC nell'istante dato. */
function tzOffsetMs(utcInstant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(utcInstant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    map.hour === '24' ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - utcInstant.getTime();
}

/**
 * Converte un "orario da parete" (anno/mese/giorno ora:minuti nel fuso dato)
 * nell'istante UTC corrispondente. Doppio passaggio per gestire i cambi
 * ora legale/solare.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = PUSH_TZ
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = tzOffsetMs(new Date(wallAsUtc), timeZone);
  let instant = new Date(wallAsUtc - firstOffset);
  const secondOffset = tzOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) {
    instant = new Date(wallAsUtc - secondOffset);
  }
  return instant;
}

interface PushableBill {
  id: string;
  title: string;
  amount: string | number;
  dueDate: string;
  status: string;
  remindersEnabled: boolean;
  customReminderDates: unknown;
}

export interface DueBillPush {
  /** Chiave stabile del promemoria (entra nel log anti-doppione). */
  reminderKey: string;
  fireAt: Date;
  title: string;
  body: string;
}

/**
 * Promemoria di una bolletta che DEVONO partire adesso: orario previsto già
 * raggiunto ma non più vecchio della finestra di recupero.
 */
export function computeDueBillPushes(
  bill: PushableBill,
  plan: BillPlan,
  now: Date,
  timeZone: string = PUSH_TZ,
  catchUpWindowMs: number = CATCH_UP_WINDOW_MS
): DueBillPush[] {
  if (bill.status === 'pagata' || !bill.remindersEnabled) return [];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bill.dueDate);
  if (!m) return [];
  const dueYear = Number(m[1]);
  const dueMonth = Number(m[2]);
  const dueDay = Number(m[3]);

  const body = `${bill.title} · ${formatEuro(bill.amount)} · scade il ${formatDueLabel(bill.dueDate)}`;

  const due: DueBillPush[] = [];
  const usedTimes = new Set<number>();
  const nowMs = now.getTime();

  const isDueNow = (fireAt: Date): boolean => {
    const t = fireAt.getTime();
    return t <= nowMs && nowMs - t <= catchUpWindowMs;
  };

  for (const offset of offsetsForPlan(plan)) {
    // Sposta la data di scadenza indietro di `offset` giorni (aritmetica di
    // calendario, indipendente dal fuso).
    const day = new Date(Date.UTC(dueYear, dueMonth - 1, dueDay));
    day.setUTCDate(day.getUTCDate() - offset);
    const fireAt = zonedTimeToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      NOTIFY_HOUR,
      0,
      timeZone
    );
    if (usedTimes.has(fireAt.getTime())) continue;
    usedTimes.add(fireAt.getTime());
    if (!isDueNow(fireAt)) continue;
    due.push({
      reminderKey: `${offset}:${bill.dueDate}`,
      fireAt,
      title: titleForOffset(offset),
      body,
    });
  }

  for (const value of normalizeCustomReminderDates(bill.customReminderDates)) {
    const cm = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
    if (!cm) continue;
    const hour = cm[4] !== undefined ? Number(cm[4]) : NOTIFY_HOUR;
    const minute = cm[5] !== undefined ? Number(cm[5]) : 0;
    const fireAt = zonedTimeToUtc(
      Number(cm[1]),
      Number(cm[2]),
      Number(cm[3]),
      hour,
      minute,
      timeZone
    );
    if (usedTimes.has(fireAt.getTime())) continue;
    usedTimes.add(fireAt.getTime());
    if (!isDueNow(fireAt)) continue;
    due.push({
      reminderKey: `custom:${value}`,
      fireAt,
      title: 'Promemoria bolletta',
      body,
    });
  }

  return due;
}

/**
 * Un giro dello scheduler: trova i promemoria da inviare adesso, li prenota
 * nel log (anti-doppione) e li invia a tutti i membri della famiglia.
 */
export async function runBillPushTick(now: Date = new Date()): Promise<number> {
  const candidates = await db
    .select({
      id: bills.id,
      familyId: bills.familyId,
      title: bills.title,
      amount: bills.amount,
      dueDate: bills.dueDate,
      status: bills.status,
      remindersEnabled: bills.remindersEnabled,
      customReminderDates: bills.customReminderDates,
    })
    .from(bills)
    .where(and(eq(bills.remindersEnabled, true), ne(bills.status, 'pagata')));

  if (candidates.length === 0) return 0;

  // Cache per famiglia: piano e membri (evita query ripetute nello stesso giro).
  const planCache = new Map<string, BillPlan>();
  const membersCache = new Map<string, string[]>();

  let sentCount = 0;

  for (const bill of candidates) {
    try {
      let plan = planCache.get(bill.familyId);
      if (!plan) {
        plan = await getPlanForFamily(bill.familyId);
        planCache.set(bill.familyId, plan);
      }

      const dueList = computeDueBillPushes(bill, plan, now);
      if (dueList.length === 0) continue;

      let memberIds = membersCache.get(bill.familyId);
      if (!memberIds) {
        const rows = await db
          .select({ userId: familyMembers.userId })
          .from(familyMembers)
          .where(eq(familyMembers.familyId, bill.familyId));
        memberIds = rows.map((r) => r.userId).filter((id): id is string => !!id);
        membersCache.set(bill.familyId, memberIds);
      }
      if (memberIds.length === 0) continue;

      for (const duePush of dueList) {
        // Prenotazione atomica: se la riga esiste già, un altro giro (o un
        // altro processo) ha già inviato questo promemoria.
        const claimed = await db
          .insert(billPushLog)
          .values({ billId: bill.id, reminderKey: duePush.reminderKey })
          .onConflictDoNothing()
          .returning({ id: billPushLog.id });
        if (claimed.length === 0) continue;

        let anyDelivered = false;
        let anyFailure = false;
        for (const userId of memberIds) {
          const result = await sendPushToUser(userId, {
            title: duePush.title,
            body: duePush.body,
            data: { billId: bill.id, familyId: bill.familyId, kind: 'bill_reminder' },
          });
          if (result.delivered > 0) anyDelivered = true;
          if (!result.ok) anyFailure = true;
        }

        // Se NESSUNO ha ricevuto la notifica e c'è stato almeno un errore di
        // invio (rete/API), annulla la prenotazione: il prossimo giro ritenta
        // (entro la finestra di recupero). Se invece almeno un membro l'ha
        // ricevuta, la prenotazione resta per evitare doppioni.
        if (!anyDelivered && anyFailure) {
          await db.delete(billPushLog).where(eq(billPushLog.id, claimed[0].id));
          logger.warn('Bill push: invio fallito, verrà ritentato', {
            billId: bill.id,
            reminderKey: duePush.reminderKey,
          });
          continue;
        }
        sentCount++;
      }
    } catch (error) {
      logger.error('Bill push tick: errore su una bolletta', {
        billId: bill.id,
        error: String(error),
      });
    }
  }

  return sentCount;
}

