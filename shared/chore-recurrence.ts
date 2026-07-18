// Regole di ricorrenza faccende, condivise tra app e server.
//
// Formato recurrenceRule (retro-compatibile con i valori storici
// "daily" | "weekly" | "monthly" senza parametri):
//   daily            → ogni giorno
//   daily:1,3,5      → solo nei giorni indicati (ISO: 1=lun ... 7=dom)
//   weekly:6         → ogni settimana nel giorno indicato
//   monthly:15       → ogni mese nel giorno indicato (oltre fine mese → ultimo giorno)

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency;
  /** daily: giorni della settimana selezionati (ISO 1-7); vuoto = tutti */
  weekdays: number[];
  /** weekly: giorno della settimana (ISO 1-7), null = non specificato */
  weekday: number | null;
  /** monthly: giorno del mese (1-31), null = non specificato */
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
    monthDay: null,
  };

  // Nessun parametro (valori storici "daily"/"weekly"/"monthly") → valido.
  if (args === null) return parsed;

  // Con parametri la validazione è severa: ogni token deve essere un numero
  // intero nel range consentito, altrimenti l'intera regola è invalida.
  const tokens = args.split(",").map((s) => s.trim());
  if (tokens.length === 0 || tokens.some((t) => !/^\d+$/.test(t))) return null;
  const nums = tokens.map((t) => parseInt(t, 10));

  if (freq === "daily") {
    if (nums.some((n) => n < 1 || n > 7)) return null;
    parsed.weekdays = Array.from(new Set(nums)).sort((a, b) => a - b);
  } else if (freq === "weekly") {
    if (nums.length !== 1 || nums[0]! < 1 || nums[0]! > 7) return null;
    parsed.weekday = nums[0]!;
  } else {
    if (nums.length !== 1 || nums[0]! < 1 || nums[0]! > 31) return null;
    parsed.monthDay = nums[0]!;
  }
  return parsed;
}

export function buildRecurrenceRule(
  frequency: RecurrenceFrequency,
  opts: { weekdays?: number[]; weekday?: number | null; monthDay?: number | null } = {}
): string {
  if (frequency === "daily") {
    const days = Array.from(new Set(opts.weekdays ?? [])).sort((a, b) => a - b);
    if (days.length === 0 || days.length === 7) return "daily";
    return `daily:${days.join(",")}`;
  }
  if (frequency === "weekly") {
    return opts.weekday ? `weekly:${opts.weekday}` : "weekly";
  }
  return opts.monthDay ? `monthly:${opts.monthDay}` : "monthly";
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
    const name = parsed.weekday
      ? WEEKDAY_LABELS.find((w) => w.value === parsed.weekday)?.long
      : null;
    return name ? `settimanale (${name})` : "settimanale";
  }
  return parsed.monthDay ? `mensile (il ${parsed.monthDay})` : "mensile";
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
    const target = parsed.weekday ?? isoWeekday(base);
    const next = new Date(base);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (isoWeekday(next) !== target);
    return toIso(next);
  }

  // monthly
  const target = parsed.monthDay ?? base.getUTCDate();
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  // Candidata nel mese corrente (se ancora futura), altrimenti mese successivo.
  for (let i = 0; i < 2; i++) {
    const day = Math.min(target, lastDayOfMonth(year, month));
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getTime() > base.getTime()) return toIso(candidate);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return null;
}
