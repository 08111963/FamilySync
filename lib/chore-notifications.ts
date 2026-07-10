/**
 * Logica PURA per le notifiche locali delle faccende (nessun import di expo o
 * react-native, così è testabile con node:test). L'hook useChoreLocalNotifications
 * usa queste funzioni per decidere COSA programmare e quando riprogrammare.
 *
 * Nessuna notifica push remota: solo notifiche locali pianificate sul dispositivo.
 */

export interface NotifiableChore {
  id: string;
  title: string;
  /** ISO: "AAAA-MM-GG" oppure timestamp completo "AAAA-MM-GGTHH:mm:ss.sssZ". */
  dueDate: string | null;
  isCompleted: boolean;
}

export interface ChoreNotificationTrigger {
  /** Chiave stabile dell'offset (giorni prima della scadenza). */
  key: string;
  /** Data/ora locale in cui mostrare la notifica. */
  date: Date;
  title: string;
  body: string;
}

/** Offset in giorni PRIMA della scadenza: giorno prima + giorno stesso. */
const OFFSETS = [1, 0];

const NOTIFY_HOUR = 8; // 08:00 ora locale.

/**
 * Versione della politica di notifica (orario + offset). Va incrementata ogni
 * volta che cambiano NOTIFY_HOUR o gli offset, così le notifiche già programmate
 * con la vecchia politica vengono riprogrammate.
 */
const SCHEDULE_POLICY_VERSION = 1;

/** Estrae la parte data "AAAA-MM-GG" da una stringa ISO (date o timestamp). */
function isoDatePart(due: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Costruisce una Date locale alle 08:00 a partire dalla data della scadenza. */
function localDueDateAt8(due: string): Date | null {
  const iso = isoDatePart(due);
  if (!iso) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  const date = new Date(y, mo - 1, d, NOTIFY_HOUR, 0, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function titleForOffset(offset: number): string {
  if (offset === 1) return "Faccenda in scadenza domani";
  return "Faccenda in scadenza oggi";
}

function formatDueLabel(due: string): string {
  const iso = isoDatePart(due);
  if (!iso) return due;
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}

/**
 * Calcola le notifiche FUTURE da programmare per una faccenda.
 * - Nessuna notifica se completata o senza scadenza.
 * - Solo trigger successivi a `now` (le date passate vengono ignorate).
 */
export function computeChoreNotificationTriggers(
  chore: NotifiableChore,
  now: Date = new Date()
): ChoreNotificationTrigger[] {
  if (chore.isCompleted || !chore.dueDate) return [];
  const base = localDueDateAt8(chore.dueDate);
  if (!base) return [];

  const body = `${chore.title} · scade il ${formatDueLabel(chore.dueDate)}`;

  const triggers: ChoreNotificationTrigger[] = [];
  for (const offset of OFFSETS) {
    const date = addDays(base, -offset);
    if (date.getTime() <= now.getTime()) continue;
    triggers.push({
      key: String(offset),
      date,
      title: titleForOffset(offset),
      body,
    });
  }
  return triggers;
}

/**
 * Firma che riassume tutto ciò che, se cambia, richiede di riprogrammare
 * le notifiche di una faccenda.
 */
export function choreNotificationSignature(chore: NotifiableChore): string {
  return [
    `v${SCHEDULE_POLICY_VERSION}`,
    chore.title,
    chore.dueDate ?? "",
    chore.isCompleted ? 1 : 0,
  ].join("|");
}

export interface StoredChoreNotification {
  signature: string;
  notifIds: string[];
}

export interface ChoreReconcileResult {
  /** choreId da cancellare (firma cambiata o faccenda non più presente). */
  toCancelIds: string[];
  /** choreId da (ri)programmare (nuova o firma cambiata). */
  toScheduleIds: string[];
}

/**
 * Confronta lo stato desiderato (faccende correnti) con quello memorizzato e
 * decide cosa cancellare e cosa riprogrammare. Funzione pura.
 */
export function reconcileChoreNotifications(
  desired: { choreId: string; signature: string }[],
  stored: Record<string, StoredChoreNotification>
): ChoreReconcileResult {
  const desiredMap = new Map(desired.map((d) => [d.choreId, d.signature]));
  const toCancelIds: string[] = [];
  const toScheduleIds: string[] = [];

  for (const choreId of Object.keys(stored)) {
    const desiredSig = desiredMap.get(choreId);
    if (desiredSig === undefined || desiredSig !== stored[choreId].signature) {
      toCancelIds.push(choreId);
    }
  }

  for (const { choreId, signature } of desired) {
    const storedSig = stored[choreId]?.signature;
    if (storedSig !== signature) {
      toScheduleIds.push(choreId);
    }
  }

  return { toCancelIds, toScheduleIds };
}
