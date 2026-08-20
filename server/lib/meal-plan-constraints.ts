export interface MealPlanConstraintPreferences {
  diet?: string;
  allergies?: string;
  notes?: string;
}

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

export function mealPlanPreferencesContainHealthData(
  preferences?: MealPlanConstraintPreferences,
): boolean {
  if (preferences?.allergies?.trim()) return true;
  const notes = normalize(preferences?.notes || "");
  if (!notes) return false;
  return /\b(?:allerg\w*|intoller\w*|celiach\w*|anafil\w*|senza glutine|gluten free|senza lattosio|non posso mangiare|non posso assumere|devo evitare|mi fa stare male)\b/.test(notes);
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
  if (notes.includes("senza glutine") || notes.includes("gluten free") || notes.includes("celiach")) {
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

export function unsupportedMealPlanHealthNote(
  preferences?: MealPlanConstraintPreferences,
): string | undefined {
  if (!mealPlanPreferencesContainHealthData(preferences)) return undefined;
  if (preferences?.allergies?.trim() || extractMealPlanHealthConstraints(preferences).length > 0) {
    return undefined;
  }
  return "L'indicazione su allergie o intolleranze nelle note non può essere verificata con sicurezza. Inserisci gli alimenti da evitare nel campo Allergie.";
}

function rulesForPreferences(preferences?: MealPlanConstraintPreferences): FoodRule[] {
  const rules: FoodRule[] = [];
  const { diet, allergies } = safetySources(preferences);

  if (/\b(vegan|vegana|vegano)\b/.test(diet)) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
    addRule(rules, MILK_RULE);
    addRule(rules, EGG_RULE);
    addRule(rules, HONEY_RULE);
  } else if (/\b(vegetarian|vegetariana|vegetariano)\b/.test(diet)) {
    addRule(rules, MEAT_RULE);
    addRule(rules, FISH_RULE);
  } else if (/\b(pescetar|pescetarian)\b/.test(diet)) {
    addRule(rules, MEAT_RULE);
  }

  if (/\b(senza glutine|gluten free|celiach|glutine)\b/.test(diet)) addRule(rules, GLUTEN_RULE);
  if (/\b(senza lattosio|lattosio)\b/.test(diet)) addRule(rules, LACTOSE_RULE);
  if (/\b(chetogen|keto|low carb|basso contenuto di carboidrati)\b/.test(diet)) addRule(rules, LOW_CARB_RULE);
  if (/\bhalal\b/.test(diet)) {
    addRule(rules, {
      code: "halal",
      label: "dieta halal",
      terms: ["maiale", "suino", "prosciutto", "salame", "pancetta", "mortadella", "vino", "birra", "liquore", "alcol"],
    });
  }

  if (/\b(glutine|celiach)\b/.test(allergies)) addRule(rules, GLUTEN_RULE);
  if (/\blattosio\b/.test(allergies)) addRule(rules, LACTOSE_RULE);
  if (/\b(latte|caseina|proteine del latte)\b/.test(allergies) && !/\blattosio\b/.test(allergies)) addRule(rules, MILK_RULE);
  if (/\b(uovo|uova|albume|tuorlo)\b/.test(allergies)) addRule(rules, EGG_RULE);
  if (/\b(arachide|arachidi)\b/.test(allergies)) addRule(rules, PEANUT_RULE);
  if (/\b(frutta secca|frutta a guscio|noci|nocciole|mandorle|pistacchi|anacardi)\b/.test(allergies)) addRule(rules, NUT_RULE);
  if (/\bpesce\b/.test(allergies)) addRule(rules, FISH_RULE);
  for (const rule of SIMPLE_ALLERGEN_RULES) {
    if (rule.terms.some((term) => hasTerm(allergies, term))) addRule(rules, rule);
  }

  // Per allergie meno comuni, il nome inserito dall'utente resta comunque un
  // divieto verificabile in modo conservativo (es. "fragole", "kiwi").
  const explicitAllergies = allergies
    .split(/\s+e\s+/i)
    .map((part) => normalize(part)
      .replace(/^(allergia|allergico|allergica|intolleranza|intollerante)\s+(a|al|alla|alle|agli)\s+/, "")
      .trim())
    .filter(Boolean);
  for (const allergen of explicitAllergies) {
    const alreadyCovered = rules.some((rule) =>
      hasTerm(allergen, rule.label) || rule.terms.some((term) => hasTerm(allergen, term)));
    if (!alreadyCovered) {
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
  }

  return rules;
}

export function hasMealPlanConstraints(preferences?: MealPlanConstraintPreferences): boolean {
  const { diet, allergies } = safetySources(preferences);
  return !!diet || !!allergies;
}

export function mealPlanRequiresGlutenFree(preferences?: MealPlanConstraintPreferences): boolean {
  return rulesForPreferences(preferences).some((rule) => rule.code === "gluten");
}

export function unsupportedMealPlanDiet(preferences?: MealPlanConstraintPreferences): string | undefined {
  const explicitDiet = normalize(preferences?.diet || "");
  if (!explicitDiet) return undefined;
  const supported = [
    "mediterran", "vegetarian", "vegan", "pescetar", "senza glutine",
    "gluten free", "senza lattosio", "halal", "chetogen", "keto",
    "low carb", "basso contenuto di carboidrati",
  ].some((marker) => explicitDiet.includes(marker));
  return supported
    ? undefined
    : "Il tipo di dieta indicato non può ancora essere verificato automaticamente. Usa una dieta mediterranea, vegetariana, vegana, pescetariana, chetogenica/low carb, senza glutine, senza lattosio o halal.";
}

export function buildMealPlanConstraintPrompt(
  preferences?: MealPlanConstraintPreferences,
): string {
  if (!hasMealPlanConstraints(preferences)) return "";
  const diet = preferences?.diet?.trim();
  const allergies = [
    preferences?.allergies?.trim(),
    ...extractMealPlanHealthConstraints(preferences),
  ].filter(Boolean).join(", ");
  return `
- VINCOLI ALIMENTARI OBBLIGATORI E PRIORITARI: prevalgono su QUALSIASI tema, esempio, regola nutrizionale o richiesta di varietà precedente.
${diet ? `- La dieta "${diet}" è un vincolo rigido: nessun pasto può contraddirla.` : ""}
${allergies ? `- Le allergie/intolleranze "${allergies}" sono vincoli di sicurezza: non usare gli allergeni né ingredienti che normalmente li contengono.` : ""}
- Se usi un sostituto compatibile, dichiarane esplicitamente la compatibilità nel titolo E nell'ingrediente. Non lasciare mai implicita la compatibilità e non usare esempi o alternative che possano contraddire un altro vincolo.
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
    for (const rule of rules) {
      for (const segment of segments) {
        const matchedTerms = rule.terms.filter((term) => hasTerm(segment, term));
        const unsafeMatch = matchedTerms.find((term) => !matchedTermIsSafe(segment, rule, term));
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