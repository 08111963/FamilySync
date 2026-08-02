import type { MealPlanSuggestion } from './openai';

/**
 * Analisi dell'equilibrio settimanale di un piano pasti "dieta mediterranea".
 *
 * L'utente aveva segnalato piani con troppi legumi, poca pasta e quasi niente
 * verdure: il prompt ora contiene una regola dedicata (mediterraneanRule in
 * generateWeeklyMealPlan), e questo modulo verifica a valle che la
 * distribuzione della settimana rispetti davvero quelle soglie:
 * - primi di pasta/riso/cereali a pranzo quasi ogni giorno (>= 5 su 7)
 * - verdure (o contorno di verdure) in OGNI pranzo e cena
 * - legumi al massimo 3 volte a settimana (pranzi+cene)
 * - pesce almeno 2 volte a settimana
 *
 * La classificazione è per parole chiave su titolo + descrizione + nomi
 * ingredienti: volutamente conservativa e senza AI, così è testabile offline.
 */

export type MealPlanItem = MealPlanSuggestion['items'][number];

const PASTA_RICE_KEYWORDS = [
  'pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'linguine', 'tagliatelle',
  'fettuccine', 'lasagne', 'lasagna', 'orecchiette', 'trofie', 'paccheri', 'bucatini',
  'maccheroni', 'tortellini', 'ravioli', 'cannelloni', 'pennette', 'mezze maniche',
  'riso', 'risotto', 'gnocchi', 'orzo', 'farro', 'couscous', 'cuscus', 'polenta',
];

const LEGUME_KEYWORDS = [
  'legum', 'fagiol', 'ceci', 'lenticch', 'pisell', 'fave', 'lupin', 'soia', 'azuki',
  'cannellin', 'borlott', 'cicerchi',
];

const FISH_KEYWORDS = [
  'pesce', 'tonno', 'salmone', 'merluzzo', 'branzino', 'orata', 'spigola', 'sgombro',
  'alici', 'acciugh', 'sarde', 'sardine', 'baccal', 'trota', 'nasello', 'platessa',
  'sogliola', 'gamber', 'calamar', 'polpo', 'seppie', 'seppia', 'cozze', 'vongole',
  'frutti di mare',
];

const VEGETABLE_KEYWORDS = [
  'verdur', 'contorno', 'insalata', 'zucchin', 'melanzan', 'pomodor', 'spinaci',
  'broccol', 'carot', 'peperon', 'zucca', 'cavolfior', 'cavolo', 'verza', 'bietol',
  'fagiolini', 'asparag', 'carciof', 'finocch', 'radicchio', 'rucola', 'cicoria',
  'lattuga', 'scarola', 'friarielli', 'cime di rapa', 'catalogna', 'sedano', 'porri',
  'ortagg', 'minestrone', 'caponata', 'ratatouille',
];

function normalizeText(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Testo completo del pasto (titolo + descrizione + nomi ingredienti), normalizzato. */
export function mealText(item: MealPlanItem): string {
  const parts = [item.title, item.description ?? ''];
  for (const ing of item.ingredients ?? []) parts.push(ing.name ?? '');
  return normalizeText(parts.join(' '));
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function hasPastaOrRice(item: MealPlanItem): boolean {
  return matchesAny(mealText(item), PASTA_RICE_KEYWORDS);
}

export function hasLegumes(item: MealPlanItem): boolean {
  return matchesAny(mealText(item), LEGUME_KEYWORDS);
}

export function hasFish(item: MealPlanItem): boolean {
  return matchesAny(mealText(item), FISH_KEYWORDS);
}

export function hasVegetables(item: MealPlanItem): boolean {
  return matchesAny(mealText(item), VEGETABLE_KEYWORDS);
}

export interface MealPlanBalanceReport {
  daysAnalyzed: number;
  lunchCount: number;
  dinnerCount: number;
  /** Pranzi con primo di pasta/riso/cereali. */
  pastaRiceLunches: number;
  /** Slot pranzo/cena SENZA verdure (date/mealType). */
  missingVegetableSlots: Array<{ date: string; mealType: string; title: string }>;
  /** Occorrenze di legumi tra pranzi e cene. */
  legumeMeals: number;
  /** Occorrenze di pesce tra pranzi e cene. */
  fishMeals: number;
  /** Squilibri rilevati, in italiano leggibile. */
  issues: string[];
  balanced: boolean;
}

/** Soglie della dieta mediterranea (settimana da 7 giorni). */
export const MEDITERRANEAN_THRESHOLDS = {
  /** Pranzi con pasta/riso: "quasi ogni giorno" ⇒ almeno 5 su 7 (scala sui giorni presenti). */
  minPastaRiceLunchRatio: 5 / 7,
  maxLegumeMeals: 3,
  minFishMeals: 2,
};

/**
 * Conta la distribuzione settimanale e segnala gli squilibri rispetto alle
 * soglie mediterranee. Considera SOLO pranzi e cene (colazioni e spuntini non
 * rientrano nelle regole contestate).
 */
export function analyzeMediterraneanBalance(items: MealPlanItem[]): MealPlanBalanceReport {
  const mains = items.filter((it) => it.mealType === 'lunch' || it.mealType === 'dinner');
  const lunches = mains.filter((it) => it.mealType === 'lunch');
  const dinners = mains.filter((it) => it.mealType === 'dinner');
  const days = new Set(mains.map((it) => it.date));

  const pastaRiceLunches = lunches.filter(hasPastaOrRice).length;
  const missingVegetableSlots = mains
    .filter((it) => !hasVegetables(it))
    .map((it) => ({ date: it.date, mealType: it.mealType, title: it.title }));
  const legumeMeals = mains.filter(hasLegumes).length;
  const fishMeals = mains.filter(hasFish).length;

  const issues: string[] = [];
  // Le soglie assolute (legumi max 3, pesce min 2) valgono per la settimana
  // piena; su piani parziali si scalano proporzionalmente ai giorni presenti.
  const dayRatio = Math.min(1, days.size / 7);
  const minPastaLunches = Math.ceil(lunches.length * MEDITERRANEAN_THRESHOLDS.minPastaRiceLunchRatio);
  const maxLegumes = Math.max(1, Math.round(MEDITERRANEAN_THRESHOLDS.maxLegumeMeals * dayRatio));
  const minFish = Math.max(1, Math.floor(MEDITERRANEAN_THRESHOLDS.minFishMeals * dayRatio));

  if (lunches.length > 0 && pastaRiceLunches < minPastaLunches) {
    issues.push(`Troppa poca pasta/riso a pranzo: ${pastaRiceLunches} su ${lunches.length} pranzi (attesi almeno ${minPastaLunches}).`);
  }
  if (missingVegetableSlots.length > 0) {
    const slots = missingVegetableSlots.map((s) => `${s.date} ${s.mealType} ("${s.title}")`).join(', ');
    issues.push(`Verdure mancanti in ${missingVegetableSlots.length} pranzi/cene: ${slots}.`);
  }
  if (legumeMeals > maxLegumes) {
    issues.push(`Troppi legumi: ${legumeMeals} pasti su ${mains.length} (massimo atteso ${maxLegumes}).`);
  }
  if (mains.length > 0 && fishMeals < minFish) {
    issues.push(`Troppo poco pesce: ${fishMeals} pasti (attesi almeno ${minFish}).`);
  }

  return {
    daysAnalyzed: days.size,
    lunchCount: lunches.length,
    dinnerCount: dinners.length,
    pastaRiceLunches,
    missingVegetableSlots,
    legumeMeals,
    fishMeals,
    issues,
    balanced: issues.length === 0,
  };
}
