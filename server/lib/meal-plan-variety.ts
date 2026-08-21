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

function itemText(item: MealPlanVarietyItem): string {
  return [item.title || "", ...(item.ingredients || []).map((ingredient) => ingredient.name || "")]
    .map(normalize)
    .join(" ");
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
 * Firma concettuale dei pranzi: carboidrato/famiglia + base + proteina.
 * Aromi, olio, insalata e verdure di contorno non cambiano la firma.
 */
export function mealPlanLunchSignature(item: MealPlanVarietyItem): string | undefined {
  const family = mealPlanLunchFamily(item);
  if (!family) return undefined;
  const text = itemText(item);
  const base = /\b(?:pomodoro|pomodori|passata|sugo)\b/.test(text)
    ? "pomodoro"
    : /\b(?:zuppa|minestra|minestrone|vellutata)\b/.test(text)
      ? "zuppa"
      : /\binsalata\b/.test(text)
        ? "insalata"
        : "preparazione semplice";
  return `${family} + ${base} + ${firstSource(proteinSources(item)) || "senza proteina identificata"}`;
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
  const lunchSignatures = compactCounts(evaluation.lunchSignatureCounts) || "nessuno ancora";
  const lunchCarbs = compactCounts(evaluation.lunchCarbohydrateCounts) || "nessuno ancora";
  const lunchProteins = compactCounts(evaluation.lunchProteinCounts) || "nessuna ancora";
  return `
- CONTESTO VARIETÀ DEI GIORNI GIÀ GENERATI: carboidrati principali usati: ${carbs}; proteine principali usate: ${proteins}.
- PRANZI GIÀ USATI (firme concettuali): ${lunchSignatures}.
- FAMIGLIE PRANZO GIÀ USATE: ${lunchFamilies}. Carboidrati pranzo: ${lunchCarbs}. Proteine pranzo: ${lunchProteins}.
- EVITA una firma di pranzo già usata, in particolare la stessa base con la stessa proteina: cambiare solo olio, erbe, insalata o un contorno non crea un pranzo nuovo.
- Per questo giorno, quando compatibile con tutti i vincoli, scegli una fonte di carboidrati e una proteina meno presenti. Non alterare mai gli ingredienti richiesti dai vincoli di sicurezza.`;
}