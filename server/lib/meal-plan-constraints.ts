import {
  MEAL_PLAN_DIET_PROFILE_DEFINITIONS,
  isMealPlanDietProfile,
  legacyMealPlanDietToProfile,
  type MealPlanDietProfile,
} from "../../shared/meal-plan-diet-profiles";
import { findGenericMealPlanTerm } from "./meal-plan-variety";

export interface MealPlanConstraintPreferences {
  dietProfile?: MealPlanDietProfile;
  notes?: string;
  maxTimeMinutes?: number;
  mealsPerDay?: number;
  /** @deprecated Read only for legacy records; ignored by profile normalization. */
  diet?: string;
  /** @deprecated Ignored by profile normalization and never accepted as a new constraint. */
  allergies?: string;
}

export type MealPlanDietaryPattern =
  | "mediterranean"
  | "vegetarian"
  | "vegan"
  | "gluten_free"
  | "lactose_free";

export type MealPlanExclusion =
  | "gluten" | "lactose" | "milk" | "egg" | "peanut" | "nuts" | "fish"
  | "soy" | "sesame" | "celery" | "mustard" | "lupin" | "sulfites"
  | "shellfish" | "molluscs";

/**
 * Interpretazione unica delle preferenze del Piano Pasti.
 *
 * I profili sono una tassonomia di prodotto e non leggono mai testo libero
 * relativo ad allergie o intolleranze.
 */
export interface NormalizedMealPlanConstraints {
  dietaryPatterns: MealPlanDietaryPattern[];
  exclusions: MealPlanExclusion[];
  customExclusions: string[];
  healthDerived: boolean;
  source: {
    dietProfile?: MealPlanDietProfile;
    notes: string;
  };
}

const UNSUPPORTED_MEDICAL_CONDITION_PATTERN = /\b(?:diabet\w*|glicemi\w*|insufficienza|renal\w*|reni\w*|gravidanz\w*|incinta|incinto|ipertension\w*|pressione alta|cardiac\w*|cardiopat\w*|cuore|oncolog\w*|patolog\w*|malatti\w*|diagnos\w*|terap\w*|farmac\w*|medic\w*|colesterolo)\b/;
const HEALTH_NOTE_PATTERN = /\b(?:allerg\w*|intoller\w*|celiac\w*|anafil\w*|senza glutine|gluten free|senza lattosio|non posso mangiare|non posso assumere|devo evitare|mi fa stare male|diabet\w*|glicemi\w*|insufficienza|renal\w*|reni\w*|gravidanz\w*|incinta|incinto|ipertension\w*|pressione alta|cardiac\w*|cardiopat\w*|cuore|oncolog\w*|patolog\w*|malatti\w*|diagnos\w*|terap\w*|farmac\w*|medic\w*|colesterolo)\b/;

export interface MealPlanConstraintItem {
  mealType?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  ingredients?: Array<{ name?: string | null }> | null;
  steps?: string[] | null;
}

export interface MealPlanConstraintViolation {
  code: string;
  constraint: string;
  itemTitle: string;
  matched?: string;
}

interface FoodRule {
  code: string;
  label: string;
  terms: string[];
  safeMarkers?: string[];
}

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const GLUTEN_RULE: FoodRule = {
  code: "gluten",
  label: "glutine",
  terms: [
    "glutine", "frumento", "grano", "semola", "farina 00", "farina di grano",
    "pasta", "penne", "spaghetti", "fusilli", "rigatoni", "linguine",
    "tagliatelle", "orecchiette", "lasagne", "cannelloni", "gnocchi",
    "pane", "fette biscottate", "biscotti", "cracker", "crostini", "pangrattato",
    "pizza", "focaccia", "piadina", "couscous", "gallette di riso", "farro", "orzo", "segale",
    "avena", "cereali", "granola", "cornetto", "brioche", "crostata",
    "ciambellone", "plumcake", "seitan", "birra",
  ],
  safeMarkers: [
    "senza glutine", "gluten free", "certificato senza glutine",
    "certificata senza glutine", "di mais", "di riso", "di legumi",
    "grano saraceno", "quinoa",
  ],
};

const LACTOSE_RULE: FoodRule = {
  code: "lactose",
  label: "lattosio",
  terms: [
    "lattosio", "latte", "yogurt", "burro", "panna", "ricotta",
    "mozzarella", "formaggio", "parmigiano", "pecorino", "mascarpone",
  ],
  safeMarkers: [
    "senza lattosio", "delattosato", "delattosata", "vegetale", "vegano",
    "vegana", "di soia", "di mandorla", "di avena", "di cocco", "di riso",
  ],
};

const LACTOSE_ONLY_GLUTEN_LABEL_RULE: FoodRule = {
  code: "unexpected-gluten-free-label",
  label: "diciture senza glutine non richieste",
  terms: ["senza glutine", "gluten free"],
};

const MILK_RULE: FoodRule = {
  code: "milk",
  label: "latte",
  terms: [
    "latte", "caseina", "siero di latte", "yogurt", "burro", "panna",
    "ricotta", "mozzarella", "formaggio", "parmigiano", "pecorino", "mascarpone",
  ],
  safeMarkers: [
    "vegetale", "vegano", "vegana", "di soia", "di mandorla", "di avena",
    "di cocco", "di riso",
  ],
};

const EGG_RULE: FoodRule = {
  code: "egg",
  label: "uova",
  terms: ["uovo", "uova", "albume", "tuorlo", "maionese"],
  safeMarkers: ["senza uova", "senza uovo", "vegano", "vegana"],
};

const MEAT_RULE: FoodRule = {
  code: "meat",
  label: "carne",
  terms: [
    "carne", "pollo", "tacchino", "manzo", "vitello", "maiale", "suino",
    "prosciutto", "salame", "pancetta", "salsiccia", "bresaola", "mortadella",
    "coniglio", "agnello", "ragù", "ragu",
  ],
};

const FISH_RULE: FoodRule = {
  code: "fish",
  label: "pesce",
  terms: [
    "pesce", "tonno", "salmone", "merluzzo", "orata", "branzino", "sgombro",
    "alici", "acciughe", "sardine", "trota", "sogliola", "dentice", "nasello",
    "rana pescatrice", "pesce spada", "polpo",
    "calamari", "gamberi", "crostacei", "molluschi", "frutti di mare",
  ],
};

const HONEY_RULE: FoodRule = {
  code: "honey",
  label: "miele",
  terms: ["miele"],
};

/** Ingredienti animali meno evidenti, vietati dal profilo vegano. */
const ANIMAL_DERIVED_RULE: FoodRule = {
  code: "animal-derived",
  label: "ingrediente animale",
  terms: [
    "strutto", "lardo", "guanciale", "gelatina", "colla di pesce",
    "brodo di carne", "brodo di pollo", "brodo di pesce", "brodo animale",
    "dado di carne", "dado di pollo", "dado di pesce", "grasso animale",
    "salsa di pesce", "bottarga", "caviale", "frattaglie", "fegato",
    "wurst", "wurstel", "speck", "cotechino",
  ],
};

const LOW_CARB_RULE: FoodRule = {
  code: "low-carb",
  label: "dieta chetogenica/low carb",
  terms: [
    "pasta", "penne", "spaghetti", "pane", "pizza", "focaccia", "piadina",
    "riso", "couscous", "farro", "orzo", "cereali", "avena", "granola",
    "patate", "zucchero", "biscotti", "torta", "cornetto", "brioche",
  ],
  safeMarkers: ["chetogenico", "chetogenica", "keto", "low carb", "a basso contenuto di carboidrati"],
};

const PEANUT_RULE: FoodRule = {
  code: "peanut",
  label: "arachidi",
  terms: ["arachide", "arachidi", "burro di arachidi"],
};

const NUT_RULE: FoodRule = {
  code: "nuts",
  label: "frutta a guscio",
  terms: [
    "frutta secca", "frutta a guscio", "noce", "noci", "nocciola", "nocciole",
    "mandorla", "mandorle", "pistacchio", "pistacchi", "anacardo", "anacardi",
    "pinolo", "pinoli", "pecan", "macadamia",
  ],
};

const SIMPLE_ALLERGEN_RULES: FoodRule[] = [
  { code: "soy", label: "soia", terms: ["soia", "tofu", "tempeh", "edamame"] },
  { code: "sesame", label: "sesamo", terms: ["sesamo", "tahina", "tahini"] },
  { code: "celery", label: "sedano", terms: ["sedano"] },
  { code: "mustard", label: "senape", terms: ["senape"] },
  { code: "lupin", label: "lupini", terms: ["lupino", "lupini"] },
  { code: "sulfites", label: "solfiti", terms: ["solfiti", "anidride solforosa"] },
  { code: "shellfish", label: "crostacei", terms: ["gamberi", "gamberetti", "scampi", "aragosta", "astice", "granchio", "crostacei"] },
  { code: "molluscs", label: "molluschi", terms: ["cozze", "vongole", "ostriche", "polpo", "calamari", "seppia", "molluschi"] },
];

function hasTerm(text: string, term: string): boolean {
  return (` ${text} `).includes(` ${normalize(term)} `);
}

function plantSubstituteIsExplicit(text: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  const plantMarkers = [
    "vegetale", "vegano", "vegana", "di soia", "di mandorla", "di avena",
    "di cocco", "di riso",
  ];
  return plantMarkers.some((marker) =>
    text.includes(`${normalizedTerm} ${marker}`) ||
    text.includes(`${normalizedTerm} spalmabile ${marker}`));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TextRange {
  start: number;
  end: number;
}

function addRegexRanges(ranges: TextRange[], text: string, expression: RegExp): void {
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) expression.lastIndex += 1;
  }
}

function glutenSafeRanges(text: string, rule: FoodRule): TextRange[] {
  const ranges: TextRange[] = [];
  const safeMarker = "(?:senza glutine|gluten free)";
  // Il marker deve qualificare proprio il prodotto intercettato. Sono ammessi
  // solo i descrittori di cereale che il pool sicuro già usa; un marker
  // presente dopo un altro alimento nella stessa frase non può rendere sicuro
  // il termine precedente.
  const optionalGrainDescriptor = "(?:\\s+(?:di|al|alla)\\s+(?:mais|riso|legumi|quinoa|grano saraceno))*";
  // Il marker è sicuro in sé (es. un titolo "Senza glutine"), ma non può
  // proteggere altre occorrenze del termine fuori dalla sua stessa porzione.
  addRegexRanges(ranges, text, new RegExp(`\\b${safeMarker}\\b`, "g"));
  for (const term of rule.terms) {
    const escapedTerm = escapeRegExp(normalize(term));
    addRegexRanges(
      ranges,
      text,
      new RegExp(`\\b${escapedTerm}${optionalGrainDescriptor}\\s+${safeMarker}\\b`, "g"),
    );
    addRegexRanges(
      ranges,
      text,
      new RegExp(`\\b${safeMarker}\\s+${escapedTerm}\\b`, "g"),
    );
  }
  return ranges;
}

function findUnsafeGlutenTerm(text: string, rule: FoodRule): string | undefined {
  const safeRanges = glutenSafeRanges(text, rule);
  for (const term of rule.terms) {
    const normalizedTerm = normalize(term);
    const expression = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!safeRanges.some((range) => start >= range.start && end <= range.end)) {
        return term;
      }
      if (match[0].length === 0) expression.lastIndex += 1;
    }
  }
  return undefined;
}

function matchedTermIsSafe(text: string, rule: FoodRule, term: string): boolean {
  if (rule.code === "gluten") {
    // Per sicurezza il sostituto deve essere dichiarato esplicitamente:
    // "pasta di riso" da solo non garantisce assenza di contaminazioni.
    // Una singola porzione di testo è sicura solo se non contiene nessuna
    // occorrenza non qualificata, incluso "glutine" fuori dal suo marker.
    return hasTerm(text, term) && !findUnsafeGlutenTerm(text, rule);
  }
  if (rule.code === "lactose") {
    return hasTerm(text, "senza lattosio") ||
      hasTerm(text, "delattosato") ||
      hasTerm(text, "delattosata") ||
      (term === "lattosio" && [
        "intolleranza al lattosio",
        "intollerante al lattosio",
        "intollerante ai latticini",
      ].some((label) => hasTerm(text, label))) ||
      plantSubstituteIsExplicit(text, term);
  }
  if (rule.code === "milk") {
    return plantSubstituteIsExplicit(text, term);
  }
  if (rule.code === "egg") {
    if (hasTerm(text, "senza uova") || hasTerm(text, "senza uovo")) return true;
    return normalize(term) === "maionese" &&
      (text.includes("maionese vegana") || text.includes("maionese vegano"));
  }
  if (rule.code === "low-carb") {
    const normalizedTerm = normalize(term);
    return [
      `${normalizedTerm} chetogenica`, `${normalizedTerm} chetogenico`,
      `${normalizedTerm} keto`, `${normalizedTerm} low carb`,
      `${normalizedTerm} a basso contenuto di carboidrati`,
    ].some((marker) => text.includes(marker));
  }
  return (rule.safeMarkers || []).some((marker) => hasTerm(text, marker));
}

function safeIngredientCanBeReferredToAs(
  ingredientText: string,
  rule: FoodRule,
  term: string,
): boolean {
  if (hasTerm(ingredientText, term) && matchedTermIsSafe(ingredientText, rule, term)) {
    return true;
  }
  // "Bevanda di riso/cocco/soia" è il nome in lista ingredienti di un latte
  // vegetale. Nei passaggi è naturale abbreviare in "latte"; l'equivalenza è
  // sicura soltanto per quel riferimento, non per panna, burro o formaggi.
  return rule.code === "lactose" &&
    term === "latte" &&
    hasTerm(ingredientText, "bevanda") &&
    ["vegetale", "di soia", "di mandorla", "di avena", "di cocco", "di riso"]
      .some((marker) => hasTerm(ingredientText, marker));
}

function addRule(target: FoodRule[], rule: FoodRule): void {
  if (!target.some((existing) => existing.code === rule.code)) target.push(rule);
}

export function normalizeMealPlanConstraints(
  preferences?: MealPlanConstraintPreferences,
): NormalizedMealPlanConstraints {
  const requestedProfile = preferences?.dietProfile;
  const dietProfile = isMealPlanDietProfile(requestedProfile)
    ? requestedProfile
    : legacyMealPlanDietToProfile(requestedProfile) ||
      legacyMealPlanDietToProfile(preferences?.diet);
  const definition = dietProfile ? MEAL_PLAN_DIET_PROFILE_DEFINITIONS[dietProfile] : undefined;
  return {
    dietaryPatterns: definition ? [definition.dietaryPattern] : [],
    exclusions: definition ? [...definition.excludes] : [],
    customExclusions: [],
    healthDerived: HEALTH_NOTE_PATTERN.test(normalize(preferences?.notes || "")),
    source: { dietProfile, notes: preferences?.notes?.trim() || "" },
  };
}

export function mealPlanPreferencesContainHealthData(
  preferences?: MealPlanConstraintPreferences,
): boolean {
  return normalizeMealPlanConstraints(preferences).healthDerived;
}

/** @deprecated Allergy extraction is intentionally disabled for meal plans. */
export function extractMealPlanHealthConstraints(_preferences?: MealPlanConstraintPreferences): string[] {
  return [];
}

export function mealPlanHasExclusion(
  preferences: MealPlanConstraintPreferences | undefined,
  exclusion: MealPlanExclusion,
): boolean {
  return normalizeMealPlanConstraints(preferences).exclusions.includes(exclusion);
}

export function mealPlanHasDietaryPattern(
  preferences: MealPlanConstraintPreferences | undefined,
  pattern: MealPlanDietaryPattern,
): boolean {
  return normalizeMealPlanConstraints(preferences).dietaryPatterns.includes(pattern);
}

/**
 * La carne rossa è una regola di equilibrio del solo catalogo mediterraneo,
 * non un requisito per i profili che escludono la carne o per gli altri
 * pattern che la possono ammettere per ragioni diverse.
 */
export function mealPlanRequiresMediterraneanRedMeat(
  preferences?: MealPlanConstraintPreferences,
): boolean {
  const profile = normalizeMealPlanConstraints(preferences).source.dietProfile;
  return profile === "mediterranean";
}

export function unsupportedMealPlanHealthNote(
  preferences?: MealPlanConstraintPreferences,
): string | undefined {
  const notes = normalize(preferences?.notes || "");
  if (!HEALTH_NOTE_PATTERN.test(notes)) return undefined;
  // Le condizioni mediche generiche non hanno una regola alimentare
  // deterministica in questo prodotto. Un'allergia estraibile nella stessa
  // frase non rende verificabile diabete, gravidanza o insufficienza renale:
  // la condizione non supportata deve restare bloccante.
  if (UNSUPPORTED_MEDICAL_CONDITION_PATTERN.test(notes)) {
    return "La condizione medica indicata nelle note non può essere verificata con sicurezza. Chiedi consiglio a un professionista.";
  }
  return "Allergie e intolleranze non si inseriscono nel Piano Pasti. Scegli un profilo dieta disponibile e consulta un professionista per esigenze individuali.";
}

function rulesForPreferences(preferences?: MealPlanConstraintPreferences): FoodRule[] {
  const rules: FoodRule[] = [];
  const normalized = normalizeMealPlanConstraints(preferences);

  if (normalized.dietaryPatterns.includes("vegetarian")) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
  }
  if (normalized.dietaryPatterns.includes("vegan")) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
    addRule(rules, MILK_RULE);
    addRule(rules, EGG_RULE);
    addRule(rules, HONEY_RULE);
    addRule(rules, ANIMAL_DERIVED_RULE);
  }

  const profileRules: Partial<Record<MealPlanExclusion, FoodRule>> = {
    gluten: GLUTEN_RULE,
    lactose: LACTOSE_RULE,
  };
  for (const exclusion of normalized.exclusions) {
    const rule = profileRules[exclusion];
    if (rule) addRule(rules, rule);
  }
  if (normalized.exclusions.includes("lactose") && !normalized.exclusions.includes("gluten")) {
    addRule(rules, LACTOSE_ONLY_GLUTEN_LABEL_RULE);
  }

  return rules;
}

export function hasMealPlanConstraints(preferences?: MealPlanConstraintPreferences): boolean {
  const normalized = normalizeMealPlanConstraints(preferences);
  return normalized.dietaryPatterns.length > 0 ||
    normalized.exclusions.length > 0 ||
    normalized.customExclusions.length > 0;
}

export function mealPlanRequiresGlutenFree(preferences?: MealPlanConstraintPreferences): boolean {
  return mealPlanHasExclusion(preferences, "gluten");
}

export function unsupportedMealPlanDiet(preferences?: MealPlanConstraintPreferences): string | undefined {
  return normalizeMealPlanConstraints(preferences).source.dietProfile
    ? undefined
    : "Scegli un profilo dieta dal menu per generare il Piano Pasti.";
}

export function buildMealPlanConstraintPrompt(
  preferences?: MealPlanConstraintPreferences,
): string {
  if (!hasMealPlanConstraints(preferences)) return "";
  const normalized = normalizeMealPlanConstraints(preferences);
  const diet = normalized.source.dietProfile
    ? MEAL_PLAN_DIET_PROFILE_DEFINITIONS[normalized.source.dietProfile].label.it
    : "";
  const lactoseRequired = normalized.exclusions.includes("lactose");
  const glutenRequired = normalized.exclusions.includes("gluten");
  const canonicalExclusions = normalized.exclusions.join(", ");
  const canonicalPatterns = normalized.dietaryPatterns.join(", ");
  const compatibilityRule = glutenRequired
    ? `- SENZA GLUTINE: non usare mai pasta, pane, fette biscottate, biscotti, couscous, farro, orzo, avena o altri prodotti a rischio se non dichiarano esplicitamente “senza glutine”. Usa invece alimenti naturalmente idonei o sostituti espliciti.`
    : lactoseRequired
      ? `- SENZA LATTOSIO: evita latte, yogurt, burro, panna, ricotta e formaggi ordinari; usa versioni esplicitamente senza lattosio o vegetali quando servono. Pasta, pane e fette biscottate normali restano consentiti. Non aggiungere né citare diciture “senza glutine” o “gluten free”: questo profilo non le richiede.`
      : `- Se usi un sostituto compatibile, dichiarane esplicitamente la compatibilità nel titolo E nell'ingrediente. Non lasciare mai implicita la compatibilità e non usare esempi o alternative che possano contraddire un altro vincolo.`;
  const profileRule = normalized.dietaryPatterns.includes("vegan")
    ? `- PROFILO VEGANO: vietati in ogni campo carne, pesce, uova, latte, yogurt, formaggi, burro, panna, miele e qualsiasi ingrediente animale. Sono ammessi solo sostituti vegetali dichiarati esplicitamente.`
    : normalized.dietaryPatterns.includes("vegetarian")
      ? `- PROFILO VEGETARIANO: vietati in ogni campo carne e pesce; uova e latticini sono ammessi.`
      : "";
  return `
- VINCOLI ALIMENTARI OBBLIGATORI E PRIORITARI: prevalgono su QUALSIASI tema, esempio, regola nutrizionale o richiesta di varietà precedente.
${canonicalPatterns ? `- Pattern alimentari canonici applicati: ${canonicalPatterns}.` : ""}
${canonicalExclusions ? `- Esclusioni canoniche applicate: ${canonicalExclusions}.` : ""}
 ${diet ? `- Il profilo "${diet}" è un vincolo rigido: nessun pasto può contraddirlo.` : ""}
${compatibilityRule}
${profileRule}
- L'array ingredients deve essere completo per ogni pasto: non omettere ingredienti, condimenti o componenti composti.
 - Prima di rispondere ricontrolla ogni titolo, descrizione, ingrediente e passaggio contro il profilo. Se un tema suggerito è incompatibile, sostituiscilo con un piatto compatibile.`;
}

function itemSegments(item: MealPlanConstraintItem): string[] {
  return [
    item.title || "",
    item.description || "",
    item.notes || "",
    ...(item.ingredients || []).map((ingredient) => ingredient?.name || ""),
    ...(item.steps || []),
  ].map(normalize).filter(Boolean);
}

export function validateMealPlanConstraints(
  items: MealPlanConstraintItem[],
  preferences?: MealPlanConstraintPreferences,
): MealPlanConstraintViolation[] {
  const rules = rulesForPreferences(preferences);
  const normalized = normalizeMealPlanConstraints(preferences);
  const requiresIngredientDetails = rules.length > 0;

  const violations: MealPlanConstraintViolation[] = [];
  for (const item of items) {
    const title = item.title?.trim() || "Pasto senza titolo";
    if (requiresIngredientDetails && (!item.ingredients || item.ingredients.length === 0)) {
      violations.push({
        code: "ingredients-missing",
        constraint: "ingredienti completi",
        itemTitle: title,
      });
      continue;
    }
    const genericTerm = findGenericMealPlanTerm({
      title: item.title || undefined,
      description: item.description || undefined,
      ingredients: (item.ingredients || []).map((ingredient) => ({
        name: ingredient?.name || undefined,
      })),
      steps: item.steps || undefined,
    });
    if (genericTerm) {
      violations.push({
        code: "generic-meal-term",
        constraint: "ingredienti e termini concreti",
        itemTitle: title,
        matched: genericTerm,
      });
    }
    const segments = itemSegments(item);
    // Le istruzioni di una ricetta nominano spesso in forma abbreviata un
    // ingrediente già dichiarato nella lista (es. "scalda il latte" dopo
    // "latte di riso"). Il controllo deve mantenere il contesto della singola
    // ricetta: rifiutare quella frase isolata renderebbe impossibile generare
    // un piano senza lattosio pur avendo tutti gli ingredienti compatibili.
    // Questa eccezione vale soltanto per un riferimento generico a un
    // ingrediente dichiarato esplicitamente sicuro; non rende sicuri altri
    // latticini (es. panna o burro) né l'allergene "lattosio" stesso.
    const ingredientSegments = (item.ingredients || [])
      .map((ingredient) => normalize(ingredient?.name || ""))
      .filter(Boolean);
    for (const rule of rules) {
      for (const segment of segments) {
        const unsafeMatch = rule.code === "gluten"
          ? findUnsafeGlutenTerm(segment, rule)
          : rule.terms.filter((term) => hasTerm(segment, term)).find((term) => {
          if (matchedTermIsSafe(segment, rule, term)) return false;
          if (term === rule.label) return true;
          const isIngredientDeclaration = ingredientSegments.includes(segment);
          if (isIngredientDeclaration) return true;
          return !ingredientSegments.some((ingredientSegment) =>
            safeIngredientCanBeReferredToAs(ingredientSegment, rule, term));
          });
        if (unsafeMatch) {
          violations.push({
            code: rule.code,
            constraint: rule.label,
            itemTitle: title,
            matched: unsafeMatch,
          });
          break;
        }
      }
    }
  }
  return violations;
}