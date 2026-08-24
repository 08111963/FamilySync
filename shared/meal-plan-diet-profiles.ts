/**
 * Catalogo chiuso per i profili del Piano Pasti.
 *
 * Non contiene allergie né condizioni mediche: i profili sono scelte di menu
 * del prodotto, verificabili dal server prima e dopo la generazione AI.
 */
export const MEAL_PLAN_DIET_PROFILES = [
  "mediterranean",
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
] as const;

export type MealPlanDietProfile = typeof MEAL_PLAN_DIET_PROFILES[number];

export type MealPlanDietProfileDefinition = {
  label: { it: string; en: string };
  dietaryPattern: "mediterranean" | "vegetarian" | "vegan" | "gluten_free" | "lactose_free";
  excludes: Array<"gluten" | "lactose">;
};

export const MEAL_PLAN_DIET_PROFILE_DEFINITIONS: Record<
  MealPlanDietProfile,
  MealPlanDietProfileDefinition
> = {
  mediterranean: {
    label: { it: "Mediterranea", en: "Mediterranean" },
    dietaryPattern: "mediterranean",
    excludes: [],
  },
  vegetarian: {
    label: { it: "Vegetariana", en: "Vegetarian" },
    dietaryPattern: "vegetarian",
    excludes: [],
  },
  vegan: {
    label: { it: "Vegana", en: "Vegan" },
    dietaryPattern: "vegan",
    excludes: [],
  },
  gluten_free: {
    label: { it: "Senza glutine", en: "Gluten-free" },
    dietaryPattern: "gluten_free",
    excludes: ["gluten"],
  },
  lactose_free: {
    label: { it: "Senza lattosio", en: "Lactose-free" },
    dietaryPattern: "lactose_free",
    excludes: ["lactose"],
  },
};

export function isMealPlanDietProfile(value: unknown): value is MealPlanDietProfile {
  return typeof value === "string" &&
    (MEAL_PLAN_DIET_PROFILES as readonly string[]).includes(value);
}

export function mealPlanDietProfileLabel(
  profile: MealPlanDietProfile,
  locale: "it" | "en" = "it",
): string {
  return MEAL_PLAN_DIET_PROFILE_DEFINITIONS[profile].label[locale];
}

/**
 * Compatibilità controllata per i valori che erano già pubblicati prima del
 * menu a cinque voci. Il campo legacy allergies non partecipa mai alla
 * conversione: i dati sanitari restano fuori dal Piano Pasti.
 */
export function legacyMealPlanDietToProfile(value: unknown): MealPlanDietProfile | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("it-IT");
  const exact: Record<string, MealPlanDietProfile> = {
    mediterranea: "mediterranean",
    mediterranean: "mediterranean",
    equilibrata: "mediterranean",
    balanced: "mediterranean",
    vegetariana: "vegetarian",
    vegetarian: "vegetarian",
    vegana: "vegan",
    vegan: "vegan",
    leggera: "mediterranean",
    light: "mediterranean",
    sportiva: "mediterranean",
    sport: "mediterranean",
    "mediterranea senza glutine": "gluten_free",
    "mediterranean gluten free": "gluten_free",
    mediterranean_gluten_free: "gluten_free",
    vegetarian_gluten_free: "gluten_free",
    "mediterranea senza lattosio": "lactose_free",
    "mediterranean lactose free": "lactose_free",
    mediterranean_lactose_free: "lactose_free",
  };
  return exact[normalized];
}

/** Normalizza sia i valori attivi sia quelli legacy prima di ogni generazione. */
export function normalizeMealPlanDietProfile(value: unknown): MealPlanDietProfile | undefined {
  if (isMealPlanDietProfile(value)) return value;
  return legacyMealPlanDietToProfile(value);
}

/**
 * La dettatura può nominare una dieta storica/combinata che il catalogo chiuso
 * non riesce a rappresentare senza perdere vincoli. In quel caso il chiamante
 * deve chiedere una scelta manuale e non avviare una generazione.
 */
export function mealPlanVoiceDietRequiresReselection(value: string): boolean {
  const text = value.toLocaleLowerCase("it-IT");
  const legacyPattern = /\b(?:pescetar\w*|halal|low[\s-]?carb|chetogenic\w*|keto)\b/;
  const mentionedProfiles = new Set<MealPlanDietProfile>();
  const profileMentions: Array<[MealPlanDietProfile, RegExp]> = [
    ["mediterranean", /\b(?:mediterrane\w*|mediterranean)\b/],
    ["vegetarian", /\bvegetarian\w*\b/],
    ["vegan", /\b(?:vegan\w*|vegana)\b/],
    ["mediterranean", /\b(?:equilibrat\w*|balanced|legger\w*|light|sportiv\w*|sport)\b/],
    ["gluten_free", /\b(?:senza glutine|gluten free)\b/],
    ["lactose_free", /\b(?:senza lattosio|lactose free)\b/],
  ];
  for (const [profile, pattern] of profileMentions) {
    if (pattern.test(text)) mentionedProfiles.add(profile);
  }
  const representableMediterraneanVariant =
    mentionedProfiles.size === 2 &&
    mentionedProfiles.has("mediterranean") &&
    (mentionedProfiles.has("gluten_free") || mentionedProfiles.has("lactose_free"));
  return legacyPattern.test(text) ||
    (mentionedProfiles.size > 1 && !representableMediterraneanVariant);
}

/** Riconosce solo espressioni dei profili chiusi nella dettatura del Piano Pasti. */
export function detectMealPlanDietProfileFromText(value: string): MealPlanDietProfile | undefined {
  if (mealPlanVoiceDietRequiresReselection(value)) return undefined;
  const text = value.toLocaleLowerCase("it-IT");
  const matches: Array<[RegExp, MealPlanDietProfile]> = [
    [/\b(?:mediterranea|mediterranean).*(?:senza glutine|gluten free)\b|\b(?:senza glutine|gluten free).*(?:mediterranea|mediterranean)\b/, "gluten_free"],
    [/\b(?:mediterranea|mediterranean).*(?:senza lattosio|lactose free)\b|\b(?:senza lattosio|lactose free).*(?:mediterranea|mediterranean)\b/, "lactose_free"],
    [/\b(?:senza glutine|gluten free)\b/, "gluten_free"],
    [/\b(?:senza lattosio|lactose free)\b/, "lactose_free"],
    [/\b(?:vegan[ao]?|vegana)\b/, "vegan"],
    [/\bvegetarian[ao]?\b/, "vegetarian"],
    [/\b(?:equilibrata|balanced|leggera|light|sportiva|sport)\b/, "mediterranean"],
    [/\bmediterrane[ao]?\b|\bmediterranean\b/, "mediterranean"],
  ];
  return matches.find(([pattern]) => pattern.test(text))?.[1];
}

export type MealPlanVoiceDietResolution = {
  requiresReselection: boolean;
  profile?: MealPlanDietProfile;
  voiceNotes: string;
};

/**
 * Mantiene separati il profilo estraibile e il testo da inoltrare come nota:
 * quando la frase contiene vincoli non esprimibili, le note devono essere
 * svuotate prima che l'utente scelga manualmente un profilo.
 */
export function resolveMealPlanVoiceDiet(value: string): MealPlanVoiceDietResolution {
  const spoken = value.trim();
  if (mealPlanVoiceDietRequiresReselection(spoken)) {
    return { requiresReselection: true, voiceNotes: "" };
  }
  return {
    requiresReselection: false,
    profile: detectMealPlanDietProfileFromText(spoken),
    voiceNotes: spoken,
  };
}