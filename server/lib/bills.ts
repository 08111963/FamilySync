/**
 * Logica pura del modulo Bollette & Scadenze (testabile senza DB).
 *
 * - computeBillStatus: deriva lo stato visibile (da_pagare | pagata | scaduta).
 *   "scaduta" NON è memorizzato: si calcola quando la data di scadenza è passata
 *   e la bolletta non è stata segnata come pagata.
 * - computeBillReminders: calcola i promemoria di una bolletta (7gg/3gg prima,
 *   giorno della scadenza, avviso scaduta). Nessun cron server-side: le notifiche
 *   locali vengono pianificate dal client; questo è solo il calcolo condiviso.
 */

export type BillStoredStatus = "da_pagare" | "pagata";
export type BillComputedStatus = "da_pagare" | "pagata" | "scaduta";
export type Plan = "free" | "premium";

export type BillReminderType = "7_days" | "3_days" | "due_day" | "overdue";

export interface BillReminder {
  type: BillReminderType;
  /** Data di attivazione del promemoria (YYYY-MM-DD). */
  date: string;
  label: string;
  /** true se la data del promemoria è già passata o è oggi rispetto a `now`. */
  isDue: boolean;
}

/** Massimo bollette ATTIVE (non pagate) per le famiglie Free. */
export const FREE_MAX_ACTIVE_BILLS = 5;

/** Converte una data in stringa YYYY-MM-DD in UTC (giorno solare, no orario). */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateString(s: string): Date {
  // Interpreta YYYY-MM-DD come mezzanotte UTC, evitando shift di fuso orario.
  return new Date(`${s}T00:00:00.000Z`);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateString(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/**
 * Stato visibile della bolletta. Se pagata -> "pagata". Altrimenti, se la data
 * di scadenza è passata (strettamente prima di oggi) -> "scaduta", altrimenti
 * "da_pagare". Il giorno stesso della scadenza NON è ancora "scaduta".
 */
export function computeBillStatus(
  bill: { status: BillStoredStatus; dueDate: string },
  now: Date = new Date(),
): BillComputedStatus {
  if (bill.status === "pagata") return "pagata";
  const today = toDateString(now);
  if (bill.dueDate < today) return "scaduta";
  return "da_pagare";
}

const REMINDER_LABELS: Record<BillReminderType, string> = {
  "7_days": "Scade tra 7 giorni",
  "3_days": "Scade tra 3 giorni",
  due_day: "Scade oggi",
  overdue: "Bolletta scaduta",
};

/**
 * Calcola i promemoria di una bolletta.
 *
 * - Free: promemoria base -> giorno della scadenza + avviso scaduta.
 * - Premium: promemoria avanzati -> 7 giorni prima, 3 giorni prima, giorno
 *   della scadenza, avviso scaduta.
 *
 * Restituisce [] se i promemoria sono disattivati o se la bolletta è già pagata.
 */
export function computeBillReminders(params: {
  dueDate: string;
  remindersEnabled: boolean;
  plan: Plan;
  status?: BillStoredStatus;
  now?: Date;
}): BillReminder[] {
  const { dueDate, remindersEnabled, plan } = params;
  const now = params.now ?? new Date();
  if (!remindersEnabled) return [];
  if (params.status === "pagata") return [];

  const types: BillReminderType[] =
    plan === "premium"
      ? ["7_days", "3_days", "due_day", "overdue"]
      : ["due_day", "overdue"];

  const today = toDateString(now);

  return types.map((type) => {
    let date: string;
    switch (type) {
      case "7_days":
        date = addDays(dueDate, -7);
        break;
      case "3_days":
        date = addDays(dueDate, -3);
        break;
      case "due_day":
        date = dueDate;
        break;
      case "overdue":
        date = addDays(dueDate, 1);
        break;
    }
    return {
      type,
      date,
      label: REMINDER_LABELS[type],
      isDue: date <= today,
    };
  });
}

/**
 * True se una famiglia può creare una nuova bolletta. Premium: sempre.
 * Free: solo se le bollette attive (non pagate) sono sotto il limite.
 */
export function canCreateBill(plan: Plan, activeBillCount: number): boolean {
  if (plan === "premium") return true;
  return activeBillCount < FREE_MAX_ACTIVE_BILLS;
}

/**
 * Ripartizione uguale dell'importo tra N membri, in centesimi, distribuendo il
 * resto sulle prime quote così che la somma sia esattamente uguale al totale.
 * Ritorna importi in formato stringa "x.yy".
 */
export function splitEqually(totalAmount: number, memberCount: number): string[] {
  if (memberCount <= 0) return [];
  const totalCents = Math.round(totalAmount * 100);
  const base = Math.floor(totalCents / memberCount);
  const remainder = totalCents - base * memberCount;
  const shares: string[] = [];
  for (let i = 0; i < memberCount; i++) {
    const cents = base + (i < remainder ? 1 : 0);
    shares.push((cents / 100).toFixed(2));
  }
  return shares;
}
