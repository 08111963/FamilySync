/**
 * Logica PURA per le notifiche locali delle bollette (nessun import di expo o
 * react-native, così è testabile con node:test). L'hook useBillLocalNotifications
 * usa queste funzioni per decidere COSA programmare e quando riprogrammare.
 *
 * Nessuna notifica push remota: solo notifiche locali pianificate sul dispositivo.
 */

export type BillPlan = "free" | "premium";

export interface NotifiableBill {
  id: string;
  title: string;
  amount: string | number;
  dueDate: string; // "AAAA-MM-GG"
  status: "da_pagare" | "pagata";
  remindersEnabled: boolean;
}

export interface BillNotificationTrigger {
  /** Chiave stabile dell'offset (giorni prima della scadenza). */
  key: string;
  /** Data/ora locale in cui mostrare la notifica. */
  date: Date;
  title: string;
  body: string;
}

/** Offset in giorni PRIMA della scadenza (negativo = dopo la scadenza). */
const PREMIUM_OFFSETS = [7, 3, 0, -1];
const FREE_OFFSETS = [0, -1];

const NOTIFY_HOUR = 9; // 09:00 ora locale.

export function formatEuro(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n)) return "€ 0,00";
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export function offsetsForPlan(plan: BillPlan): number[] {
  return plan === "premium" ? PREMIUM_OFFSETS : FREE_OFFSETS;
}

/** Costruisce una Date locale alle 09:00 a partire da "AAAA-MM-GG". */
function localDueDateAt9(dueDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day, NOTIFY_HOUR, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function titleForOffset(offset: number): string {
  if (offset >= 7) return "Bolletta tra una settimana";
  if (offset === 3) return "Bolletta tra 3 giorni";
  if (offset === 0) return "Bolletta in scadenza oggi";
  return "Bolletta scaduta";
}

/**
 * Calcola le notifiche FUTURE da programmare per una bolletta.
 * - Nessuna notifica se pagata o con promemoria disattivati.
 * - Solo trigger successivi a `now` (le date passate vengono ignorate).
 */
export function computeBillNotificationTriggers(
  bill: NotifiableBill,
  plan: BillPlan,
  now: Date = new Date()
): BillNotificationTrigger[] {
  if (bill.status === "pagata" || !bill.remindersEnabled) return [];
  const base = localDueDateAt9(bill.dueDate);
  if (!base) return [];

  const triggers: BillNotificationTrigger[] = [];
  for (const offset of offsetsForPlan(plan)) {
    const date = addDays(base, -offset);
    if (date.getTime() <= now.getTime()) continue;
    triggers.push({
      key: String(offset),
      date,
      title: titleForOffset(offset),
      body: `${bill.title} · ${formatEuro(bill.amount)} · scade il ${formatDueLabel(bill.dueDate)}`,
    });
  }
  return triggers;
}

function formatDueLabel(dueDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return dueDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Firma che riassume tutto ciò che, se cambia, richiede di riprogrammare
 * le notifiche di una bolletta.
 */
export function billNotificationSignature(bill: NotifiableBill, plan: BillPlan): string {
  // Include title e amount perché compaiono nel testo della notifica: se cambiano,
  // le notifiche già programmate vanno riprogrammate con il testo aggiornato.
  return [
    bill.title,
    String(bill.amount),
    bill.dueDate,
    bill.remindersEnabled ? 1 : 0,
    bill.status,
    plan,
  ].join("|");
}

export interface StoredBillNotification {
  signature: string;
  notifIds: string[];
}

export interface ReconcileResult {
  /** billId da cancellare (firma cambiata o bolletta non più presente). */
  toCancelBillIds: string[];
  /** billId da (ri)programmare (nuova o firma cambiata). */
  toScheduleBillIds: string[];
}

/**
 * Confronta lo stato desiderato (bollette correnti) con quello memorizzato e
 * decide cosa cancellare e cosa riprogrammare. Funzione pura.
 */
export function reconcileBillNotifications(
  desired: { billId: string; signature: string }[],
  stored: Record<string, StoredBillNotification>
): ReconcileResult {
  const desiredMap = new Map(desired.map((d) => [d.billId, d.signature]));
  const toCancelBillIds: string[] = [];
  const toScheduleBillIds: string[] = [];

  // Bollette memorizzate ma non più presenti, o con firma cambiata -> cancella.
  for (const billId of Object.keys(stored)) {
    const desiredSig = desiredMap.get(billId);
    if (desiredSig === undefined || desiredSig !== stored[billId].signature) {
      toCancelBillIds.push(billId);
    }
  }

  // Bollette nuove o con firma cambiata -> programma.
  for (const { billId, signature } of desired) {
    const storedSig = stored[billId]?.signature;
    if (storedSig !== signature) {
      toScheduleBillIds.push(billId);
    }
  }

  return { toCancelBillIds, toScheduleBillIds };
}
