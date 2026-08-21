export interface MealPlanVarietyItem {
  date?: string;
  mealType?: string;
  title?: string;
  ingredients?: Array<{ name?: string }>;
}

export type MealPlanVarietyIssueCode =
  | "low_carbohydrate_variety"
  | "repeated_carbohydrate"
  | "repeated_protein"
  | "low_lunch_family_variety"
  | "excessive_lunch_family"
  | "repeated_lunch_base"
  | "repeated_lunch_pattern"
  | "consecutive_lunch_pattern";

export interface MealPlanVarietyIssue {
  code: MealPlanVarietyIssueCode;
  source?: string;
  count?: number;
}

export interface MealPlanVarietyEvaluation {
  mainMealCount: number;
  carbohydrateCounts: Record<string, number>;
  proteinCounts: Record<string, number>;
  distinctCarbohydrateSources: number;
  lunchCount: number;
  lunchFamilyCounts: Record<string, number>;
  lunchBaseCounts: Record<string, number>;
  lunchSignatureCounts: Record<string, number>;
  lunchCarbohydrateCounts: Record<string, number>;
  lunchProteinCounts: Record<string, number>;
  issues: MealPlanVarietyIssue[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matches(value: string, pattern: RegExp): boolean {
  return pattern.test(normalize(value));
}

function carbohydrateSources(item: MealPlanVarietyItem): Set<string> {
  const sources = new Set<string>();
  for (const ingredient of item.ingredients || []) {
    const name = ingredient.name || "";
    if (matches(name, /\b(?:pasta(?: di (?:mais|riso))? senza glutine|gnocchi senza glutine)\b/)) {
      sources.add("pasta senza glutine");
    } else if (matches(name, /\bpasta\b/)) {
      sources.add("pasta");
    } else if (matches(name, /\b(?:riso|risotto)\b/)) {
      sources.add("riso/risotto");
    } else if (matches(name, /\bcouscous\b/)) {
      sources.add("couscous");
    } else if (matches(name, /\b(?:farro|orzo|avena|cereali)\b/)) {
      sources.add("cereale in chicco");
    } else if (matches(name, /\bpatate?\b/)) {
      sources.add("patate");
    } else if (matches(name, /\bpolenta\b/)) {
      sources.add("polenta");
    } else if (matches(name, /\bquinoa\b/)) {
      sources.add("quinoa");
    } else if (matches(name, /\b(?:pane|fette biscottate) senza glutine\b/)) {
      sources.add("pane senza glutine");
    } else if (matches(name, /\b(?:pane|piadina)\b/)) {
      sources.add("pane/piadina");
    } else if (matches(name, /\b(?:ceci|lenticchie|fagioli|piselli)\b/)) {
      sources.add("legumi");
    }
  }
  return sources;
}

function proteinSources(item: MealPlanVarietyItem): Set<string> {
  const sources = new Set<string>();
  for (const ingredient of item.ingredients || []) {
    const name = ingredient.name || "";
    if (matches(name, /\bsalmone\b/)) sources.add("salmone");
    else if (matches(name, /\bmerluzzo\b/)) sources.add("merluzzo");
    else if (matches(name, /\btonno\b/)) sources.add("tonno");
    else if (matches(name, /\bpollo\b/)) sources.add("pollo");
    else if (matches(name, /\btacchino\b/)) sources.add("tacchino");
    else if (matches(name, /\buova?\b/)) sources.add("uova");
    else if (matches(name, /\b(?:ceci|lenticchie|fagioli|piselli)\b/)) sources.add("legumi");
    else if (matches(name, /\b(?:ricotta|formaggio|parmigiano|mozzarella)\b/)) sources.add("latticini");
  }
  return sources;
}

function firstSource(sources: Set<string>): string | undefined {
  return sources.values().next().value;
}

/**
 * Classifica la struttura del pranzo, non la decorazione nel titolo. Zuppa e
 * insalata sono famiglie autonome perché pane o legumi in accompagnamento non
 * devono trasformarle artificialmente in un altro piatto.
 */
export function mealPlanLunchFamily(item: MealPlanVarietyItem): string | undefined {
  if (item.mealType !== "lunch") return undefined;
  const title = normalize(item.title || "");
  if (/^(?:zuppa|minestra|minestrone|vellutata)\b/.test(title)) return "zuppa";
  if (/^insalata\b/.test(title)) return "insalata di cereali/piatto freddo";

  const carbohydrate = firstSource(carbohydrateSources(item));
  if (!carbohydrate) return undefined;
  if (carbohydrate === "pasta senza glutine") return "pasta";
  if (carbohydrate === "riso/risotto") return "risotto/riso";
  if (carbohydrate === "cereale in chicco") return "cereale in chicco";
  if (carbohydrate === "pane senza glutine") return "pane/piadina";
  if (carbohydrate === "legumi") return "piatto di legumi";
  if (carbohydrate === "patate" || carbohydrate === "polenta") return "patate/polenta";
  return carbohydrate;
}

/**
 * Base/preparazione del pranzo: famiglia + condimento o tecnica principale.
 * È deliberatamente distinta dalla firma completa, così "pasta al pomodoro
 * con tonno" e "pasta al pomodoro con pollo" restano la stessa base.
 */
export function mealPlanLunchBase(item: MealPlanVarietyItem): string | undefined {
  const family = mealPlanLunchFamily(item);
  if (!family) return undefined;
  // La base appartiene al piatto dichiarato, non alla lista completa degli
  // ingredienti: pomodori o insalata come contorno non devono cambiare una
  // pasta al pesto in una pasta al pomodoro o in un'insalata.
  const text = normalize(item.title || "");
  const base = /\b(?:pomodoro|pomodori|passata|sugo)\b/.test(text)
    ? "pomodoro"
    : /\b(?:pesto)\b/.test(text)
      ? "pesto"
      : /\b(?:zuppa|minestra|minestrone|vellutata)\b/.test(text)
        ? "zuppa"
        : /\binsalata\b/.test(text)
          ? "insalata"
          : /\b(?:forno|gratina(?:to|ta)?)\b/.test(text)
            ? "forno"
            : "preparazione semplice";
  return `${family} + ${base}`;
}

/**
 * Firma concettuale dei pranzi: famiglia + base/preparazione + proteina.
 * Aromi, olio, insalata e verdure di contorno non cambiano la firma.
 */
export function mealPlanLunchSignature(item: MealPlanVarietyItem): string | undefined {
  const base = mealPlanLunchBase(item);
  if (!base) return undefined;
  return `${base} + ${firstSource(proteinSources(item)) || "senza proteina identificata"}`;
}

type LunchFamilyDefinition = {
  family: string;
  available: (normalizedIngredients: string[]) => boolean;
};

const LUNCH_FAMILY_ROTATION: LunchFamilyDefinition[] = [
  { family: "pasta", available: (items) => items.some((item) => /\bpasta\b/.test(item)) },
  { family: "risotto/riso", available: (items) => items.some((item) => /\briso\b/.test(item)) },
  { family: "piatto di legumi", available: (items) => items.some((item) => /\b(?:ceci|lenticchie|fagioli|piselli)\b/.test(item)) },
  { family: "couscous", available: (items) => items.some((item) => /\bcouscous\b/.test(item)) },
  { family: "cereale in chicco", available: (items) => items.some((item) => /\b(?:farro|orzo|cereali)\b/.test(item)) },
  { family: "patate/polenta", available: (items) => items.some((item) => /\b(?:patate?|polenta)\b/.test(item)) },
  { family: "quinoa", available: (items) => items.some((item) => /\bquinoa\b/.test(item)) },
  { family: "zuppa", available: (items) => items.some((item) => /\b(?:ceci|lenticchie|fagioli|piselli)\b/.test(item)) },
  { family: "insalata di cereali/piatto freddo", available: (items) =>
    items.some((item) => /\b(?:riso|cereali|quinoa|couscous)\b/.test(item)) },
  { family: "pane/piadina", available: (items) => items.some((item) => /\b(?:pane|piadina)\b/.test(item)) },
];

/**
 * Pianifica prima le famiglie dei pranzi, senza usare il modello. Le famiglie
 * provengono solo dal pool già filtrato a monte dagli stessi vincoli alimentari.
 * Con almeno quattro alternative, la prima rotazione di sette giorni privilegia
 * famiglie diverse; se il pool è ristretto, ripete in modo bilanciato.
 */
export function planMealPlanLunchFamilies(
  ingredientNames: string[],
  days = 7,
  rotationOffset = 0,
): Array<string | undefined> {
  const normalizedIngredients = ingredientNames.map(normalize);
  const available = LUNCH_FAMILY_ROTATION
    .filter((entry) => entry.available(normalizedIngredients))
    .map((entry) => entry.family);
  if (available.length === 0 || days <= 0) return Array.from({ length: Math.max(0, days) });

  // La settimana standard ha sette pranzi: quando il pool offre ulteriori
  // famiglie opzionali (zuppa, insalata, pane), completa prima una rotazione
  // delle sette famiglie primarie. Questo mantiene Piano A e Piano B coerenti
  // pur lasciando il degrado bilanciato ai pool realmente più piccoli.
  const primaryFamilies = available.slice(0, Math.min(days, available.length));
  const rotated = primaryFamilies.map((_, index) =>
    primaryFamilies[(index + rotationOffset) % primaryFamilies.length]!);
  const counts = new Map<string, number>();
  const targets: string[] = [];
  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const minimumCount = Math.min(...rotated.map((family) => counts.get(family) || 0));
    const target = rotated.find((family) => (counts.get(family) || 0) === minimumCount)!;
    counts.set(target, (counts.get(target) || 0) + 1);
    targets.push(target);
  }
  return targets;
}

function countSources(
  items: MealPlanVarietyItem[],
  classifier: (item: MealPlanVarietyItem) => Set<string>,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const source of classifier(item)) {
      counts.set(source, (counts.get(source) || 0) + 1);
    }
  }
  return Object.fromEntries(counts);
}

function countValues(values: Array<string | undefined>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries(counts);
}

/**
 * Valuta solo la varietà culinaria del piano già generato. Non tratta mai un
 * risultato monotono come pericoloso e non modifica alcun vincolo alimentare.
 */
export function evaluateMealPlanVariety(
  items: MealPlanVarietyItem[],
): MealPlanVarietyEvaluation {
  const mainMeals = items.filter((item) =>
    item.mealType === "lunch" || item.mealType === "dinner");
  const carbohydrateCounts = countSources(mainMeals, carbohydrateSources);
  const proteinCounts = countSources(mainMeals, proteinSources);
  const lunches = items.filter((item) => item.mealType === "lunch");
  const lunchFamilyCounts = countValues(lunches.map(mealPlanLunchFamily));
  const lunchBaseCounts = countValues(lunches.map(mealPlanLunchBase));
  const lunchSignatureCounts = countValues(lunches.map(mealPlanLunchSignature));
  const lunchCarbohydrateCounts = countSources(lunches, carbohydrateSources);
  const lunchProteinCounts = countSources(lunches, proteinSources);
  const distinctCarbohydrateSources = Object.keys(carbohydrateCounts).length;
  const issues: MealPlanVarietyIssue[] = [];
  const targetCarbohydrateSources = mainMeals.length >= 12 ? 4 : mainMeals.length >= 6 ? 3 : 2;
  const dominantCarbohydrate = Object.entries(carbohydrateCounts)
    .sort(([, left], [, right]) => right - left)[0];

  if (
    mainMeals.length >= 6
    && (
      distinctCarbohydrateSources < targetCarbohydrateSources
      || !!dominantCarbohydrate && dominantCarbohydrate[1] / mainMeals.length >= 0.5
    )
  ) {
    issues.push({
      code: "low_carbohydrate_variety",
      source: dominantCarbohydrate?.[0],
      count: distinctCarbohydrateSources,
    });
  }
  for (const [source, count] of Object.entries(carbohydrateCounts)) {
    if (count >= 4) issues.push({ code: "repeated_carbohydrate", source, count });
  }
  for (const [source, count] of Object.entries(proteinCounts)) {
    if (count >= 3) issues.push({ code: "repeated_protein", source, count });
  }
  if (lunches.length >= 6 && Object.keys(lunchFamilyCounts).length < 4) {
    issues.push({
      code: "low_lunch_family_variety",
      count: Object.keys(lunchFamilyCounts).length,
    });
  }
  for (const [source, count] of Object.entries(lunchFamilyCounts)) {
    if (count > 3) issues.push({ code: "excessive_lunch_family", source, count });
  }
  for (const [source, count] of Object.entries(lunchBaseCounts)) {
    if (count > 2) issues.push({ code: "repeated_lunch_base", source, count });
  }
  for (const [source, count] of Object.entries(lunchSignatureCounts)) {
    if (count > 2) issues.push({ code: "repeated_lunch_pattern", source, count });
  }
  for (const [source, count] of Object.entries(lunchCarbohydrateCounts)) {
    if (count > 3) issues.push({ code: "repeated_carbohydrate", source, count });
  }
  for (const [source, count] of Object.entries(lunchProteinCounts)) {
    if (count > 2) issues.push({ code: "repeated_protein", source, count });
  }
  const chronologicalLunches = [...lunches].sort((left, right) =>
    (left.date || "").localeCompare(right.date || ""));
  for (let index = 1; index < chronologicalLunches.length; index++) {
    const previous = mealPlanLunchSignature(chronologicalLunches[index - 1]!);
    const current = mealPlanLunchSignature(chronologicalLunches[index]!);
    if (previous && previous === current) {
      issues.push({ code: "consecutive_lunch_pattern", source: current, count: 2 });
    }
  }

  return {
    mainMealCount: mainMeals.length,
    carbohydrateCounts,
    proteinCounts,
    distinctCarbohydrateSources,
    lunchCount: lunches.length,
    lunchFamilyCounts,
    lunchBaseCounts,
    lunchSignatureCounts,
    lunchCarbohydrateCounts,
    lunchProteinCounts,
    issues,
  };
}

function compactCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => `${source} (${count})`)
    .join(", ");
}

function avoidNext(
  counts: Record<string, number>,
  limit: number,
): string {
  return Object.entries(counts)
    .filter(([, count]) => count >= limit)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source]) => source)
    .join(", ") || "nessuno ancora";
}

/**
 * Mantiene il contesto tra blocchi giornalieri piccolo e privo del JSON delle
 * ricette: il modello vede soltanto categorie già usate, non titoli o dati
 * superflui della famiglia.
 */
export function buildMealPlanVarietyContext(
  items: MealPlanVarietyItem[],
): string {
  const evaluation = evaluateMealPlanVariety(items);
  if (evaluation.mainMealCount === 0) return "";
  const carbs = compactCounts(evaluation.carbohydrateCounts) || "nessuna ancora";
  const proteins = compactCounts(evaluation.proteinCounts) || "nessuna ancora";
  const lunchFamilies = compactCounts(evaluation.lunchFamilyCounts) || "nessuna ancora";
  const lunchBases = compactCounts(evaluation.lunchBaseCounts) || "nessuna ancora";
  const lunchSignatures = compactCounts(evaluation.lunchSignatureCounts) || "nessuno ancora";
  const lunchCarbs = compactCounts(evaluation.lunchCarbohydrateCounts) || "nessuno ancora";
  const lunchProteins = compactCounts(evaluation.lunchProteinCounts) || "nessuna ancora";
  return `
- CONTESTO VARIETÀ DEI GIORNI GIÀ GENERATI: carboidrati principali usati: ${carbs}; proteine principali usate: ${proteins}.
- PRANZI GIÀ USATI (firme concettuali): ${lunchSignatures}.
- LUNCH FAMILY COUNTS: ${lunchFamilies}.
- LUNCH BASE COUNTS: ${lunchBases}.
- LUNCH PROTEIN COUNTS: ${lunchProteins}. Carboidrati pranzo: ${lunchCarbs}.
- AVOID NEXT: ${avoidNext(evaluation.lunchFamilyCounts, 3)}, ${avoidNext(evaluation.lunchBaseCounts, 2)}, ${avoidNext(evaluation.lunchProteinCounts, 2)}.
- EVITA una firma di pranzo già usata, in particolare la stessa base con la stessa proteina: cambiare solo olio, erbe, insalata o un contorno non crea un pranzo nuovo.
- Per questo giorno, quando compatibile con tutti i vincoli, scegli una fonte di carboidrati e una proteina meno presenti. Non alterare mai gli ingredienti richiesti dai vincoli di sicurezza.`;
}