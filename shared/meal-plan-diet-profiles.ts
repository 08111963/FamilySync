/**
 * Catalogo chiuso per i profili del Piano Pasti.
 *
 * Non contiene allergie né condizioni mediche: i profili sono scelte di menu
 * del prodotto, verificabili dal server prima e dopo la generazione AI.
 */
export const MEAL_PLAN_DIET_PROFILES = [
  "mediterranean",
  "mediterranean_gluten_free",
  "mediterranean_lactose_free",
  "vegetarian",
  "vegetarian_gluten_free",
  "vegan",
  // Profili già pubblicati: restano opzioni fisse per non eliminare funzioni.
  "pescetarian",
  "low_carb",
  "halal",
] as const;

export type MealPlanDietProfile = typeof MEAL_PLAN_DIET_PROFILES[number];

export type MealPlanDietProfileDefinition = {
  label: { it: string; en: string };
  dietaryPattern: "mediterranean" | "vegetarian" | "vegan" | "pescetarian" | "low-carb" | "halal";
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
  mediterranean_gluten_free: {
    label: { it: "Mediterranea senza glutine", en: "Mediterranean gluten-free" },
    dietaryPattern: "mediterranean",
    excludes: ["gluten"],
  },
  mediterranean_lactose_free: {
    label: { it: "Mediterranea senza lattosio", en: "Mediterranean lactose-free" },
    dietaryPattern: "mediterranean",
    excludes: ["lactose"],
  },
  vegetarian: {
    label: { it: "Vegetariana", en: "Vegetarian" },
    dietaryPattern: "vegetarian",
    excludes: [],
  },
  vegetarian_gluten_free: {
    label: { it: "Vegetariana senza glutine", en: "Vegetarian gluten-free" },
    dietaryPattern: "vegetarian",
    excludes: ["gluten"],
  },
  vegan: {
    label: { it: "Vegana", en: "Vegan" },
    dietaryPattern: "vegan",
    excludes: [],
  },
  pescetarian: {
    label: { it: "Pescetariana", en: "Pescetarian" },
    dietaryPattern: "pescetarian",
    excludes: [],
  },
  low_carb: {
    label: { it: "Low carb", en: "Low carb" },
    dietaryPattern: "low-carb",
    excludes: [],
  },
  halal: {
    label: { it: "Halal", en: "Halal" },
    dietaryPattern: "halal",
    excludes: [],
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
 * Compatibilità controllata solo per client pubblicati prima del menu chiuso.
 * Il campo legacy allergies non partecipa mai alla conversione.
 */
export function legacyMealPlanDietToProfile(value: unknown): MealPlanDietProfile | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("it-IT");
  const exact: Record<string, MealPlanDietProfile> = {
    mediterranea: "mediterranean",
    mediterranean: "mediterranean",
    vegetariana: "vegetarian",
    vegetarian: "vegetarian",
    vegana: "vegan",
    vegan: "vegan",
    pescetariana: "pescetarian",
    pescetarian: "pescetarian",
    "low carb": "low_carb",
    chetogenica: "low_carb",
    keto: "low_carb",
    halal: "halal",
    "mediterranea senza glutine": "mediterranean_gluten_free",
    "mediterranean gluten free": "mediterranean_gluten_free",
    "mediterranea senza lattosio": "mediterranean_lactose_free",
    "mediterranean lactose free": "mediterranean_lactose_free",
    "vegetariana senza glutine": "vegetarian_gluten_free",
    "vegetarian gluten free": "vegetarian_gluten_free",
  };
  return exact[normalized];
}

/** Riconosce solo espressioni dei profili chiusi nella dettatura del Piano Pasti. */
export function detectMealPlanDietProfileFromText(value: string): MealPlanDietProfile | undefined {
  const text = value.toLocaleLowerCase("it-IT");
  const matches: Array<[RegExp, MealPlanDietProfile]> = [
    [/\b(?:mediterranea|mediterranean).*(?:senza glutine|gluten free)\b|\b(?:senza glutine|gluten free).*(?:mediterranea|mediterranean)\b/, "mediterranean_gluten_free"],
    [/\b(?:mediterranea|mediterranean).*(?:senza lattosio|lactose free)\b|\b(?:senza lattosio|lactose free).*(?:mediterranea|mediterranean)\b/, "mediterranean_lactose_free"],
    [/\b(?:vegetariana|vegetarian).*(?:senza glutine|gluten free)\b|\b(?:senza glutine|gluten free).*(?:vegetariana|vegetarian)\b/, "vegetarian_gluten_free"],
    [/\bvegana?\b|\bvegan\b/, "vegan"],
    [/\bpescetarian[ao]?\b/, "pescetarian"],
    [/\b(?:low carb|chetogenic[ao]?|keto)\b/, "low_carb"],
    [/\bhalal\b/, "halal"],
    [/\bvegetarian[ao]?\b/, "vegetarian"],
    [/\bmediterrane[ao]?\b|\bmediterranean\b/, "mediterranean"],
  ];
  return matches.find(([pattern]) => pattern.test(text))?.[1];
}