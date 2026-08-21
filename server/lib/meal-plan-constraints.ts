export interface MealPlanConstraintPreferences {
  diet?: string;
  allergies?: string;
  notes?: string;
}

export type MealPlanDietaryPattern =
  | "mediterranean"
  | "vegetarian"
  | "vegan"
  | "pescetarian"
  | "low-carb"
  | "halal";

export type MealPlanExclusion =
  | "gluten"
  | "lactose"
  | "milk"
  | "egg"
  | "peanut"
  | "nuts"
  | "fish"
  | "soy"
  | "sesame"
  | "celery"
  | "mustard"
  | "lupin"
  | "sulfites"
  | "shellfish"
  | "molluscs";

/**
 * Interpretazione unica delle preferenze del Piano Pasti.
 *
 * `healthDerived` riguarda il consenso per dati sanitari, non la sicurezza
 * alimentare: una scelta "senza glutine" può essere personale, mentre
 * "celiaco" e il campo Allergie dichiarano una condizione sanitaria. In
 * entrambi i casi l'esclusione alimentare risultante è identica.
 */
export interface NormalizedMealPlanConstraints {
  dietaryPatterns: MealPlanDietaryPattern[];
  exclusions: MealPlanExclusion[];
  customExclusions: string[];
  healthDerived: boolean;
  source: {
    diet: string;
    allergies: string;
    notes: string;
  };
}

const UNSUPPORTED_MEDICAL_CONDITION_PATTERN = /\b(?:diabet\w*|glicemi\w*|insufficienza|renal\w*|reni\w*|gravidanz\w*|incinta|incinto|ipertension\w*|pressione alta|cardiac\w*|cardiopat\w*|cuore|oncolog\w*|patolog\w*|malatti\w*|diagnos\w*|terap\w*|farmac\w*|medic\w*|colesterolo)\b/;
const HEALTH_NOTE_PATTERN = /\b(?:allerg\w*|intoller\w*|celiac\w*|anafil\w*|senza glutine|gluten free|senza lattosio|non posso mangiare|non posso assumere|devo evitare|mi fa stare male|diabet\w*|glicemi\w*|insufficienza|renal\w*|reni\w*|gravidanz\w*|incinta|incinto|ipertension\w*|pressione alta|cardiac\w*|cardiopat\w*|cuore|oncolog\w*|patolog\w*|malatti\w*|diagnos\w*|terap\w*|farmac\w*|medic\w*|colesterolo)\b/;

export interface MealPlanConstraintItem {
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
    "pizza", "focaccia", "piadina", "couscous", "farro", "orzo", "segale",
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
    "alici", "acciughe", "sardine", "trota", "pesce spada", "polpo",
    "calamari", "gamberi", "crostacei", "molluschi", "frutti di mare",
  ],
};

const HONEY_RULE: FoodRule = {
  code: "honey",
  label: "miele",
  terms: ["miele"],
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
    "frutta secca", "frutta a guscio", "noci", "nocciole", "mandorle",
    "pistacchi", "anacardi", "pinoli", "pecan", "macadamia",
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

function matchedTermIsSafe(text: string, rule: FoodRule, term: string): boolean {
  if (rule.code === "gluten") {
    // Per sicurezza il sostituto deve essere dichiarato esplicitamente:
    // "pasta di riso" da solo non garantisce assenza di contaminazioni.
    return hasTerm(text, "senza glutine") || hasTerm(text, "gluten free");
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

function safetySources(preferences?: MealPlanConstraintPreferences): {
  diet: string;
  allergies: string;
} {
  const notes = normalize(preferences?.notes || "");
  const notesDescribeDiet =
    /\b(dieta|vegetarian|vegan|pescetar|mediterran|chetogen|keto|low carb|senza glutine|senza lattosio|halal)\b/.test(notes);
  return {
    diet: normalize(`${preferences?.diet || ""} ${notesDescribeDiet ? notes : ""}`),
    allergies: normalize([
      preferences?.allergies || "",
      ...extractMealPlanHealthConstraints(preferences),
    ].join(", ")),
  };
}

function cleanExtractedConstraint(value: string): string {
  return normalize(value)
    .split(/\b(?:ma|pero|preferisco|vorrei|invece|e poi)\b/, 1)[0]!
    .replace(/^(?:il|lo|la|i|gli|le|del|dello|della|dei|degli|delle)\s+/, "")
    .trim();
}

export function extractMealPlanHealthConstraints(
  preferences?: MealPlanConstraintPreferences,
): string[] {
  const notes = normalize(preferences?.notes || "");
  if (!notes) return [];

  const extracted: string[] = [];
  if (notes.includes("senza glutine") || notes.includes("gluten free") || notes.includes("celiac")) {
    extracted.push("glutine");
  }
  if (notes.includes("senza lattosio")) extracted.push("lattosio");

  const patterns = [
    /\bnon posso (?:mangiare|assumere)\s+(.+)$/,
    /\bdevo evitare\s+(.+)$/,
    /\b(?:allerg\w*|intoller\w*)\s+(?:(?:a|al|allo|alla|ai|agli|alle)\s+)(.+)$/,
    /\banafil\w*\s+(?:(?:a|al|allo|alla|ai|agli|alle|da|dal|dallo|dalla|dai|dagli|dalle)\s+)(.+)$/,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    const value = match?.[1] ? cleanExtractedConstraint(match[1]) : "";
    if (value) extracted.push(value);
  }
  return [...new Set(extracted)];
}

function addUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) target.push(value);
}

/**
 * Centralizza la semantica delle preferenze: l'origine resta disponibile per
 * consenso e messaggi, ma l'applicazione alimentare usa soltanto pattern ed
 * esclusioni canonici. Nessun altro modulo deve riclassificare testo libero
 * di dieta/allergie con regex proprie.
 */
export function normalizeMealPlanConstraints(
  preferences?: MealPlanConstraintPreferences,
): NormalizedMealPlanConstraints {
  const source = {
    diet: preferences?.diet?.trim() || "",
    allergies: preferences?.allergies?.trim() || "",
    notes: preferences?.notes?.trim() || "",
  };
  const normalizedNotes = normalize(source.notes);
  const notesDescribeDiet =
    /\b(dieta|vegetarian|vegan|pescetar|mediterran|chetogen|keto|low carb|senza glutine|gluten free|senza lattosio|halal)\b/.test(normalizedNotes);
  const dietText = normalize(`${source.diet} ${notesDescribeDiet ? source.notes : ""}`);
  const allergyText = normalize([
    source.allergies,
    ...extractMealPlanHealthConstraints(preferences),
  ].join(" "));
  const constraintText = `${dietText} ${allergyText}`.trim();
  const dietaryPatterns: MealPlanDietaryPattern[] = [];
  const exclusions: MealPlanExclusion[] = [];
  const customExclusions: string[] = [];

  if (/\bmediterran\w*\b/.test(dietText)) addUnique(dietaryPatterns, "mediterranean");
  if (/\bvegetarian\w*\b/.test(dietText)) addUnique(dietaryPatterns, "vegetarian");
  if (/\bvegan\w*\b/.test(dietText)) addUnique(dietaryPatterns, "vegan");
  if (/\bpescetar\w*\b|\bpescetarian\w*\b/.test(dietText)) addUnique(dietaryPatterns, "pescetarian");
  if (/\b(?:chetogen\w*|keto|low carb|basso contenuto di carboidrati)\b/.test(dietText)) {
    addUnique(dietaryPatterns, "low-carb");
  }
  if (/\bhalal\b/.test(dietText)) addUnique(dietaryPatterns, "halal");

  if (/\b(?:senza glutine|gluten free|gluten-free|glutine|celiac\w*)\b/.test(constraintText)) {
    addUnique(exclusions, "gluten");
  }
  if (/\b(?:senza lattosio|lattosio|intolleranza al lattosio|intollerante al lattosio)\b/.test(constraintText)) {
    addUnique(exclusions, "lactose");
  }
  if (/\b(?:latte|caseina|proteine del latte)\b/.test(allergyText)) addUnique(exclusions, "milk");
  if (/\b(?:uovo|uova|albume|tuorlo)\b/.test(allergyText)) addUnique(exclusions, "egg");
  if (/\b(?:arachide|arachidi)\b/.test(allergyText)) addUnique(exclusions, "peanut");
  if (/\b(?:frutta secca|frutta a guscio|noci|nocciole|mandorle|pistacchi|anacardi)\b/.test(allergyText)) {
    addUnique(exclusions, "nuts");
  }
  if (/\bpesce\b/.test(allergyText)) addUnique(exclusions, "fish");
  for (const rule of SIMPLE_ALLERGEN_RULES) {
    if (rule.terms.some((term) => hasTerm(allergyText, term))) {
      addUnique(exclusions, rule.code as MealPlanExclusion);
    }
  }

  const knownAllergenText = /\b(?:glutine|celiac\w*|lattosio|latte|caseina|proteine del latte|uovo|uova|albume|tuorlo|arachid\w*|frutta secca|frutta a guscio|noci|nocciole|mandorle|pistacchi|anacardi|pesce|soia|sesamo|sedano|senape|lupin\w*|solfiti|anidride solforosa|gamber\w*|scampi|aragosta|astice|granchio|crostacei|cozze|vongole|ostriche|polpo|calamari|seppia|molluschi)\b/;
  for (const part of allergyText.split(/\s+e\s+/i)) {
    const cleaned = normalize(part)
      .replace(/^(?:allergia|allergico|allergica|intolleranza|intollerante)\s+(?:a|al|allo|alla|alle|agli)\s+/, "")
      .trim();
    if (cleaned && !knownAllergenText.test(cleaned)) addUnique(customExclusions, cleaned);
  }

  const dietDeclaresMedicalCondition = /\b(?:celiac\w*|intolleranza al lattosio|intollerante al lattosio)\b/.test(
    normalize(source.diet),
  );
  const healthDerived = Boolean(source.allergies) ||
    dietDeclaresMedicalCondition ||
    HEALTH_NOTE_PATTERN.test(normalizedNotes);

  return { dietaryPatterns, exclusions, customExclusions, healthDerived, source };
}

export function mealPlanPreferencesContainHealthData(
  preferences?: MealPlanConstraintPreferences,
): boolean {
  return normalizeMealPlanConstraints(preferences).healthDerived;
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

export function unsupportedMealPlanHealthNote(
  preferences?: MealPlanConstraintPreferences,
): string | undefined {
  if (!mealPlanPreferencesContainHealthData(preferences)) return undefined;
  const notes = normalize(preferences?.notes || "");
  // Le condizioni mediche generiche non hanno una regola alimentare
  // deterministica in questo prodotto. Un'allergia estraibile nella stessa
  // frase non rende verificabile diabete, gravidanza o insufficienza renale:
  // la condizione non supportata deve restare bloccante.
  if (UNSUPPORTED_MEDICAL_CONDITION_PATTERN.test(notes)) {
    return "La condizione medica indicata nelle note non può essere verificata con sicurezza. Chiedi consiglio al medico e inserisci solo gli alimenti da evitare nel campo Allergie.";
  }
  if (preferences?.allergies?.trim() || extractMealPlanHealthConstraints(preferences).length > 0) {
    return undefined;
  }
  return "L'indicazione su allergie o intolleranze nelle note non può essere verificata con sicurezza. Inserisci gli alimenti da evitare nel campo Allergie.";
}

function rulesForPreferences(preferences?: MealPlanConstraintPreferences): FoodRule[] {
  const rules: FoodRule[] = [];
  const normalized = normalizeMealPlanConstraints(preferences);

  if (normalized.dietaryPatterns.includes("vegan")) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
    addRule(rules, MILK_RULE);
    addRule(rules, EGG_RULE);
    addRule(rules, HONEY_RULE);
  } else if (normalized.dietaryPatterns.includes("vegetarian")) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
  } else if (normalized.dietaryPatterns.includes("pescetarian")) {
    addRule(rules, MEAT_RULE);
  }

  if (normalized.dietaryPatterns.includes("low-carb")) addRule(rules, LOW_CARB_RULE);
  if (normalized.dietaryPatterns.includes("halal")) {
    addRule(rules, {
      code: "halal",
      label: "dieta halal",
      terms: ["maiale", "suino", "prosciutto", "salame", "pancetta", "mortadella", "vino", "birra", "liquore", "alcol"],
    });
  }

  const knownRules: Record<MealPlanExclusion, FoodRule> = {
    gluten: GLUTEN_RULE,
    lactose: LACTOSE_RULE,
    milk: MILK_RULE,
    egg: EGG_RULE,
    peanut: PEANUT_RULE,
    nuts: NUT_RULE,
    fish: FISH_RULE,
    soy: SIMPLE_ALLERGEN_RULES[0]!,
    sesame: SIMPLE_ALLERGEN_RULES[1]!,
    celery: SIMPLE_ALLERGEN_RULES[2]!,
    mustard: SIMPLE_ALLERGEN_RULES[3]!,
    lupin: SIMPLE_ALLERGEN_RULES[4]!,
    sulfites: SIMPLE_ALLERGEN_RULES[5]!,
    shellfish: SIMPLE_ALLERGEN_RULES[6]!,
    molluscs: SIMPLE_ALLERGEN_RULES[7]!,
  };
  for (const exclusion of normalized.exclusions) addRule(rules, knownRules[exclusion]);

  const allergies = normalize([
    normalized.source.allergies,
    ...extractMealPlanHealthConstraints(preferences),
  ].join(", "));
  for (const rule of SIMPLE_ALLERGEN_RULES) {
    if (rule.terms.some((term) => hasTerm(allergies, term))) addRule(rules, rule);
  }

  // Per allergie meno comuni, il nome inserito dall'utente resta comunque un
  // divieto verificabile in modo conservativo (es. "fragole", "kiwi").
  for (const allergen of normalized.customExclusions) {
    const terms = [allergen];
    if (allergen.endsWith("e")) terms.push(`${allergen.slice(0, -1)}a`);
    if (allergen.endsWith("i")) {
      terms.push(`${allergen.slice(0, -1)}o`);
      terms.push(`${allergen.slice(0, -1)}e`);
    }
    addRule(rules, {
      code: `allergen-${allergen.replace(/\s+/g, "-")}`,
      label: allergen,
      terms,
      safeMarkers: [`senza ${allergen}`],
    });
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
  const explicitDiet = normalize(preferences?.diet || "");
  if (!explicitDiet) return undefined;
  const normalized = normalizeMealPlanConstraints(preferences);
  const supported = [
    "mediterran", "vegetarian", "vegan", "pescetar", "senza glutine",
    "gluten free", "senza lattosio", "lattosio", "halal", "chetogen", "keto",
    "low carb", "basso contenuto di carboidrati",
  ].some((marker) => explicitDiet.includes(marker)) ||
    normalized.dietaryPatterns.length > 0 ||
    normalized.exclusions.includes("gluten") ||
    normalized.exclusions.includes("lactose");
  return supported
    ? undefined
    : "Il tipo di dieta indicato non può ancora essere verificato automaticamente. Usa una dieta mediterranea, vegetariana, vegana, pescetariana, chetogenica/low carb, senza glutine, senza lattosio o halal.";
}

export function buildMealPlanConstraintPrompt(
  preferences?: MealPlanConstraintPreferences,
): string {
  if (!hasMealPlanConstraints(preferences)) return "";
  const normalized = normalizeMealPlanConstraints(preferences);
  const diet = normalized.source.diet;
  const allergies = [
    normalized.source.allergies,
    ...extractMealPlanHealthConstraints(preferences),
  ].filter(Boolean).join(", ");
  const lactoseRequired = normalized.exclusions.includes("lactose");
  const milkRequired = normalized.exclusions.includes("milk");
  const canonicalExclusions = normalized.exclusions
    .concat(normalized.customExclusions.map((item) => `allergene:${item}` as MealPlanExclusion))
    .join(", ");
  const canonicalPatterns = normalized.dietaryPatterns.join(", ");
  const compatibilityRule = lactoseRequired
    ? `- Per il vincolo lattosio crea ricette naturalmente prive di latticini. Non usare né nominare lattosio, latte, yogurt, burro, panna, ricotta o formaggi nell'output. Non etichettare i piatti come "senza lattosio": la compatibilità è garantita dagli ingredienti scelti.`
    : milkRequired
      ? `- Per il vincolo latte/proteine del latte non usare latte, caseina, siero, yogurt, burro, panna, ricotta o formaggi. Un prodotto solo "senza lattosio" non è compatibile con questo vincolo.`
    : `- Se usi un sostituto compatibile, dichiarane esplicitamente la compatibilità nel titolo E nell'ingrediente. Non lasciare mai implicita la compatibilità e non usare esempi o alternative che possano contraddire un altro vincolo.`;
  return `
- VINCOLI ALIMENTARI OBBLIGATORI E PRIORITARI: prevalgono su QUALSIASI tema, esempio, regola nutrizionale o richiesta di varietà precedente.
${canonicalPatterns ? `- Pattern alimentari canonici applicati: ${canonicalPatterns}.` : ""}
${canonicalExclusions ? `- Esclusioni canoniche applicate: ${canonicalExclusions}.` : ""}
${diet ? `- La dieta "${diet}" è un vincolo rigido: nessun pasto può contraddirla.` : ""}
${allergies ? `- Le allergie/intolleranze "${allergies}" sono vincoli di sicurezza: non usare gli allergeni né ingredienti che normalmente li contengono.` : ""}
${compatibilityRule}
- L'array ingredients deve essere completo per ogni pasto: non omettere ingredienti, condimenti o componenti composti.
- Prima di rispondere ricontrolla ogni titolo, descrizione, ingrediente e passaggio contro dieta e allergie. Se un tema suggerito è incompatibile, sostituiscilo con un piatto compatibile.`;
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
  if (rules.length === 0) return [];

  const violations: MealPlanConstraintViolation[] = [];
  for (const item of items) {
    const title = item.title?.trim() || "Pasto senza titolo";
    if (!item.ingredients || item.ingredients.length === 0) {
      violations.push({
        code: "ingredients-missing",
        constraint: "ingredienti completi",
        itemTitle: title,
      });
      continue;
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
    const ingredientSegments = item.ingredients
      .map((ingredient) => normalize(ingredient?.name || ""))
      .filter(Boolean);
    for (const rule of rules) {
      for (const segment of segments) {
        const matchedTerms = rule.terms.filter((term) => hasTerm(segment, term));
        const unsafeMatch = matchedTerms.find((term) => {
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