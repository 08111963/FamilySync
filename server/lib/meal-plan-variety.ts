export interface MealPlanVarietyItem {
  mealType?: string;
  title?: string;
  ingredients?: Array<{ name?: string }>;
}

export type MealPlanVarietyIssueCode =
  | "low_carbohydrate_variety"
  | "repeated_carbohydrate"
  | "repeated_protein";

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
    } else if (matches(name, /\b(?:riso|risotto)\b/)) {
      sources.add("riso/risotto");
    } else if (matches(name, /\bpatate?\b/)) {
      sources.add("patate");
    } else if (matches(name, /\bpolenta\b/)) {
      sources.add("polenta");
    } else if (matches(name, /\bquinoa\b/)) {
      sources.add("quinoa");
    } else if (matches(name, /\b(?:pane|fette biscottate) senza glutine\b/)) {
      sources.add("pane senza glutine");
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
    else if (matches(name, /\b(?:pollo|tacchino)\b/)) sources.add("carne bianca");
    else if (matches(name, /\buova?\b/)) sources.add("uova");
    else if (matches(name, /\b(?:ceci|lenticchie|fagioli|piselli)\b/)) sources.add("legumi");
    else if (matches(name, /\b(?:ricotta|formaggio|parmigiano|mozzarella)\b/)) sources.add("latticini");
  }
  return sources;
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

  return {
    mainMealCount: mainMeals.length,
    carbohydrateCounts,
    proteinCounts,
    distinctCarbohydrateSources,
    issues,
  };
}

function compactCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => `${source} (${count})`)
    .join(", ");
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
  return `
- CONTESTO VARIETÀ DEI GIORNI GIÀ GENERATI: carboidrati principali usati: ${carbs}; proteine principali usate: ${proteins}.
- Per questo giorno, quando compatibile con tutti i vincoli, scegli una fonte di carboidrati e una proteina meno presenti. Non alterare mai gli ingredienti richiesti dai vincoli di sicurezza.`;
}