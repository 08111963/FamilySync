// Regole di ricorrenza faccende, condivise tra app e server.
//
// Formato recurrenceRule (retro-compatibile con i valori storici
// "daily" | "weekly" | "monthly" senza parametri):
//   daily            → ogni giorno
//   daily:1,3,5      → solo nei giorni indicati (ISO: 1=lun ... 7=dom)
//   weekly:6         → ogni settimana nel giorno indicato
//   weekly:2,5       → ogni settimana nei giorni indicati (più giorni)
//   monthly:15       → ogni mese nel giorno indicato (oltre fine mese → ultimo giorno)
//   monthly:1,15     → ogni mese nei giorni indicati (più giorni)

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency;
  /** daily/weekly: giorni della settimana selezionati (ISO 1-7); vuoto = tutti (daily) o non specificato (weekly) */
  weekdays: number[];
  /** weekly: primo giorno selezionato (retro-compatibilità), null = non specificato */
  weekday: number | null;
  /** monthly: giorni del mese selezionati (1-31); vuoto = non specificato */
  monthDays: number[];
  /** monthly: primo giorno selezionato (retro-compatibilità), null = non specificato */
  monthDay: number | null;
}

export const WEEKDAY_LABELS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Lun", long: "lunedì" },
  { value: 2, short: "Mar", long: "martedì" },
  { value: 3, short: "Mer", long: "mercoledì" },
  { value: 4, short: "Gio", long: "giovedì" },
  { value: 5, short: "Ven", long: "venerdì" },
  { value: 6, short: "Sab", long: "sabato" },
  { value: 7, short: "Dom", long: "domenica" },
];

export function parseRecurrenceRule(rule: string | null | undefined): ParsedRecurrence | null {
  if (!rule) return null;
  const colonIdx = rule.indexOf(":");
  const freq = colonIdx === -1 ? rule : rule.slice(0, colonIdx);
  const args = colonIdx === -1 ? null : rule.slice(colonIdx + 1);
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") return null;

  const parsed: ParsedRecurrence = {
    frequency: freq,
    weekdays: [],
    weekday: null,
    monthDays: [],
    monthDay: null,
  };

  // Nessun parametro (valori storici "daily"/"weekly"/"monthly") → valido.
  if (args === null) return parsed;

  // Con parametri la validazione è severa: ogni token deve essere un numero
  // intero nel range consentito, altrimenti l'intera regola è invalida.
  const tokens = args.split(",").map((s) => s.trim());
  if (tokens.length === 0 || tokens.some((t) => !/^\d+$/.test(t))) return null;
  const nums = tokens.map((t) => parseInt(t, 10));

  if (freq === "daily" || freq === "weekly") {
    if (nums.some((n) => n < 1 || n > 7)) return null;
    const days = Array.from(new Set(nums)).sort((a, b) => a - b);
    parsed.weekdays = days;
    if (freq === "weekly") parsed.weekday = days[0] ?? null;
  } else {
    if (nums.some((n) => n < 1 || n > 31)) return null;
    const days = Array.from(new Set(nums)).sort((a, b) => a - b);
    parsed.monthDays = days;
    parsed.monthDay = days[0] ?? null;
  }
  return parsed;
}

export function buildRecurrenceRule(
  frequency: RecurrenceFrequency,
  opts: {
    weekdays?: number[];
    weekday?: number | null;
    monthDays?: number[];
    monthDay?: number | null;
  } = {}
): string {
  const weekdaySet = Array.from(new Set(opts.weekdays ?? [])).sort((a, b) => a - b);

  if (frequency === "daily") {
    if (weekdaySet.length === 0 || weekdaySet.length === 7) return "daily";
    return `daily:${weekdaySet.join(",")}`;
  }
  if (frequency === "weekly") {
    const days = weekdaySet.length > 0 ? weekdaySet : opts.weekday ? [opts.weekday] : [];
    return days.length > 0 ? `weekly:${days.join(",")}` : "weekly";
  }
  const monthDaySet = Array.from(new Set(opts.monthDays ?? [])).sort((a, b) => a - b);
  const days = monthDaySet.length > 0 ? monthDaySet : opts.monthDay ? [opts.monthDay] : [];
  return days.length > 0 ? `monthly:${days.join(",")}` : "monthly";
}

/** Etichetta leggibile in italiano, es. "settimanale (sabato)". */
export function recurrenceLabel(rule: string | null | undefined): string | null {
  const parsed = parseRecurrenceRule(rule);
  if (!parsed) return rule ?? null;
  if (parsed.frequency === "daily") {
    if (parsed.weekdays.length === 0 || parsed.weekdays.length === 7) return "giornaliera";
    const names = parsed.weekdays
      .map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.short.toLowerCase())
      .filter(Boolean);
    return `giornaliera (${names.join(", ")})`;
  }
  if (parsed.frequency === "weekly") {
    if (parsed.weekdays.length === 0) return "settimanale";
    if (parsed.weekdays.length === 1) {
      const name = WEEKDAY_LABELS.find((w) => w.value === parsed.weekdays[0])?.long;
      return name ? `settimanale (${name})` : "settimanale";
    }
    const names = parsed.weekdays
      .map((d) => WEEKDAY_LABELS.find((w) => w.value === d)?.short.toLowerCase())
      .filter(Boolean);
    return `settimanale (${names.join(", ")})`;
  }
  if (parsed.monthDays.length === 0) return "mensile";
  if (parsed.monthDays.length === 1) return `mensile (il ${parsed.monthDays[0]})`;
  return `mensile (il ${parsed.monthDays.join(", ")})`;
}

// --- Calcolo prossima occorrenza (solo date, nessun fuso orario) -----------

function toUtcDate(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Giorno della settimana ISO (1=lun ... 7=dom) di una data UTC. */
function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Calcola la prossima data di scadenza (YYYY-MM-DD) STRETTAMENTE successiva
 * a `afterIsoDate` secondo la regola. Ritorna null se la regola non è valida.
 */
export function nextDueDate(
  rule: string | null | undefined,
  afterIsoDate: string
): string | null {
  const parsed = parseRecurrenceRule(rule);
  const base = toUtcDate(afterIsoDate);
  if (!parsed || !base) return null;

  if (parsed.frequency === "daily") {
    const days = parsed.weekdays.length > 0 ? parsed.weekdays : [1, 2, 3, 4, 5, 6, 7];
    const next = new Date(base);
    for (let i = 0; i < 7; i++) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (days.includes(isoWeekday(next))) return toIso(next);
    }
    return null;
  }

  if (parsed.frequency === "weekly") {
    const targets = parsed.weekdays.length > 0 ? parsed.weekdays : [isoWeekday(base)];
    const next = new Date(base);
    for (let i = 0; i < 7; i++) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (targets.includes(isoWeekday(next))) return toIso(next);
    }
    return null;
  }

  // monthly: più giorni del mese → la prima candidata futura tra tutte.
  const targets = parsed.monthDays.length > 0 ? parsed.monthDays : [base.getUTCDate()];
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  for (let i = 0; i < 2; i++) {
    const candidates = targets
      .map((t) => new Date(Date.UTC(year, month, Math.min(t, lastDayOfMonth(year, month)))))
      .filter((c) => c.getTime() > base.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length > 0) return toIso(candidates[0]!);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return null;
}

/**
 * Espande una regola in un elenco di date (YYYY-MM-DD) a partire da
 * `startIsoDate` (inclusa se coerente con la regola) fino a `untilIsoDate`,
 * con un tetto massimo di occorrenze. Usata per gli eventi calendario.
 */
export function expandOccurrences(
  rule: string | null | undefined,
  startIsoDate: string,
  untilIsoDate: string,
  maxOccurrences: number = 100
): string[] {
  const parsed = parseRecurrenceRule(rule);
  const start = toUtcDate(startIsoDate);
  const until = toUtcDate(untilIsoDate);
  if (!parsed || !start || !until) return [];

  const out: string[] = [];
  const startIso = toIso(start);

  // La data di partenza conta se coerente con la regola.
  const matchesRule = (d: Date): boolean => {
    if (parsed.frequency === "daily") {
      const days = parsed.weekdays.length > 0 ? parsed.weekdays : [1, 2, 3, 4, 5, 6, 7];
      return days.includes(isoWeekday(d));
    }
    if (parsed.frequency === "weekly") {
      const targets = parsed.weekdays.length > 0 ? parsed.weekdays : [isoWeekday(start)];
      return targets.includes(isoWeekday(d));
    }
    const targets = parsed.monthDays.length > 0 ? parsed.monthDays : [start.getUTCDate()];
    const last = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth());
    return targets.some((t) => Math.min(t, last) === d.getUTCDate());
  };

  if (matchesRule(start)) out.push(startIso);

  let cursor = startIso;
  while (out.length < maxOccurrences) {
    const next = nextDueDate(rule, cursor);
    if (!next) break;
    const nextDate = toUtcDate(next);
    if (!nextDate || nextDate.getTime() > until.getTime()) break;
    out.push(next);
    cursor = next;
  }
  return out;
}
