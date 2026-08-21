import test from "node:test";
import assert from "node:assert/strict";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import {
  buildMealPlanConstraintPrompt,
  normalizeMealPlanConstraints,
  validateMealPlanConstraints,
  type MealPlanConstraintPreferences,
  type MealPlanExclusion,
} from "../lib/meal-plan-constraints";
import {
  __setOpenAiClientForTest,
  compatibleMealIngredients,
  generateWeeklyMealPlan,
  MAX_MEAL_PLAN_MODEL_CALLS,
} from "../lib/openai";
import { evaluateMealPlanVariety } from "../lib/meal-plan-variety";
import { prepareMealPlanPreferences } from "../routes/ai";

type AllergenCase = {
  name: string;
  preferences: MealPlanConstraintPreferences;
  exclusion: MealPlanExclusion;
  forbidden: string;
  safe: string;
};

/**
 * Inventario parametrico dei vincoli canonici già dichiarati dal prodotto.
 * I termini sono rappresentativi: la regola completa resta nel modulo
 * centralizzato e viene verificata su tutti i campi della ricetta.
 */
const ALLERGEN_CASES: AllergenCase[] = [
  { name: "glutine", preferences: { allergies: "glutine" }, exclusion: "gluten", forbidden: "gallette di riso", safe: "gallette di riso senza glutine" },
  { name: "lattosio", preferences: { allergies: "lattosio" }, exclusion: "lactose", forbidden: "ricotta", safe: "yogurt senza lattosio" },
  { name: "latte", preferences: { allergies: "latte" }, exclusion: "milk", forbidden: "caseina", safe: "yogurt vegetale di cocco" },
  { name: "uova", preferences: { allergies: "uova" }, exclusion: "egg", forbidden: "maionese", safe: "maionese vegana" },
  { name: "arachidi", preferences: { allergies: "arachidi" }, exclusion: "peanut", forbidden: "burro di arachidi", safe: "riso" },
  { name: "frutta a guscio", preferences: { allergies: "noce" }, exclusion: "nuts", forbidden: "noce", safe: "riso" },
  { name: "pesce", preferences: { allergies: "pesce" }, exclusion: "fish", forbidden: "sogliola", safe: "riso" },
  { name: "soia", preferences: { allergies: "soia" }, exclusion: "soy", forbidden: "tofu", safe: "riso" },
  { name: "sesamo", preferences: { allergies: "sesamo" }, exclusion: "sesame", forbidden: "tahini", safe: "riso" },
  { name: "sedano", preferences: { allergies: "sedano" }, exclusion: "celery", forbidden: "sedano", safe: "riso" },
  { name: "senape", preferences: { allergies: "senape" }, exclusion: "mustard", forbidden: "senape", safe: "riso" },
  { name: "lupini", preferences: { allergies: "lupini" }, exclusion: "lupin", forbidden: "lupino", safe: "riso" },
  { name: "solfiti", preferences: { allergies: "solfiti" }, exclusion: "sulfites", forbidden: "anidride solforosa", safe: "riso" },
  { name: "crostacei", preferences: { allergies: "crostacei" }, exclusion: "shellfish", forbidden: "gamberetti", safe: "riso" },
  { name: "molluschi", preferences: { allergies: "molluschi" }, exclusion: "molluscs", forbidden: "vongole", safe: "riso" },
];

function recipeWith(value: string, field: "title" | "description" | "notes" | "ingredients" | "steps") {
  return {
    title: field === "title" ? value : "Pasto compatibile",
    description: field === "description" ? value : "Preparazione compatibile",
    notes: field === "notes" ? value : "Nessuna nota",
    ingredients: [{ name: field === "ingredients" ? value : "riso" }],
    steps: [
      field === "steps" ? value : "Lava gli ingredienti.",
      "Cuoci gli ingredienti indicati.",
      "Assembla e servi il pasto.",
    ],
  };
}

const SAFE_DIVERSE_LUNCHES = [
  ["Riso con pollo", ["riso", "pollo", "zucchine"]],
  ["Pasta senza glutine con ceci", ["pasta senza glutine", "ceci", "pomodori"]],
  ["Patate con tacchino", ["patate", "tacchino", "spinaci"]],
  ["Polenta con lenticchie", ["polenta di mais", "lenticchie", "carote"]],
  ["Quinoa con fagioli", ["quinoa", "fagioli", "peperoni"]],
  ["Couscous di mais senza glutine con ceci", ["couscous di mais senza glutine", "ceci", "broccoli"]],
  ["Gnocchi senza glutine con tacchino", ["gnocchi senza glutine", "tacchino", "bietole"]],
] as const;

test("audit parametrico: tutti gli allergeni canonici normalizzano, validano tutti i campi e mantengono pool e varietà", () => {
  for (const scenario of ALLERGEN_CASES) {
    const normalized = normalizeMealPlanConstraints(scenario.preferences);
    assert.ok(normalized.exclusions.includes(scenario.exclusion), `${scenario.name}: normalizzazione`);
    assert.match(
      buildMealPlanConstraintPrompt(scenario.preferences),
      new RegExp(`Esclusioni canoniche applicate:.*\\b${scenario.exclusion}\\b`, "i"),
      `${scenario.name}: prompt`,
    );

    for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
      const violations = validateMealPlanConstraints(
        [recipeWith(scenario.forbidden, field)],
        scenario.preferences,
      );
      assert.ok(
        violations.some((violation) => violation.code === scenario.exclusion),
        `${scenario.name}: ${field} deve bloccare ${scenario.forbidden}`,
      );
    }
    for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
      assert.deepEqual(
        validateMealPlanConstraints([recipeWith(scenario.safe, field)], scenario.preferences),
        [],
        `${scenario.name}: ${field} accetta solo il marker sicuro documentato`,
      );
    }
    if (scenario.exclusion === "gluten") {
      const glutenBypassAttempts = [
        "gallette di riso con pasta senza glutine",
        "pasta senza glutine con pasta",
        "gallette di riso senza glutine con gallette di riso",
        "pasta senza glutine con glutine aggiunto",
      ];
      for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
        for (const text of glutenBypassAttempts) {
          const bypassAttempt = validateMealPlanConstraints([recipeWith(text, field)], scenario.preferences);
          assert.ok(
            bypassAttempt.some((violation) => violation.code === "gluten"),
            `glutine: ${field} non deve estendere il marker sicuro a un'altra occorrenza (${text})`,
          );
        }
      }
    }

    const pool = compatibleMealIngredients(scenario.preferences, "main");
    assert.ok(pool.length > 0, `${scenario.name}: pool principale disponibile`);
    for (const ingredient of pool) {
      assert.deepEqual(
        validateMealPlanConstraints([{ title: ingredient, ingredients: [{ name: ingredient }] }], scenario.preferences),
        [],
        `${scenario.name}: pool compatibile (${ingredient})`,
      );
    }

    const lunches = SAFE_DIVERSE_LUNCHES.map(([title, ingredients], index) => ({
      date: `2026-08-${String(index + 3).padStart(2, "0")}`,
      mealType: "lunch",
      title,
      ingredients: ingredients.map((name) => ({ name })),
    }));
    assert.deepEqual(validateMealPlanConstraints(lunches, scenario.preferences), [], `${scenario.name}: menu vario sicuro`);
    const variety = evaluateMealPlanVariety(lunches);
    assert.ok(Object.keys(variety.lunchFamilyCounts).length >= 4, `${scenario.name}: famiglie pranzo disponibili`);
    assert.ok(!variety.issues.some((issue) => issue.code === "low_lunch_family_variety"), `${scenario.name}: varietà non allenta la sicurezza`);
  }
});

type MockCall = { prompt: string; ingredientNames: string[] | undefined };

function createAllergenAuditClient() {
  const calls: MockCall[] = [];
  return {
    calls,
    client: {
      chat: {
        completions: {
          create: async (request: any) => {
            const prompt = request.messages.find((message: any) => message.role === "system")!.content as string;
            const itemSchema = request.response_format.json_schema.schema.properties.items.items;
            const ingredientNames = itemSchema.properties.ingredients.items.properties.name.enum as string[] | undefined;
            calls.push({ prompt, ingredientNames });
            const dates = (prompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./)?.[1] || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
            const mealTypes = itemSchema.properties.mealType.enum as string[];
            const ingredient = ingredientNames?.[0] || "mela";
            const items = dates.flatMap((date) => mealTypes.map((mealType) => ({
              date,
              mealType,
              // Il mock deve esercitare il generatore senza introdurre un
              // doppione artificiale nello stesso tipo di pasto.
              title: `Ricetta ${mealType} compatibile ${date}`,
              description: "Ricetta sintetica compatibile.",
              ingredients: [{ name: ingredient, quantity: "1", unit: "pezzo" }],
              steps: [
                "Prepara l'ingrediente indicato.",
                "Cuocilo con cura.",
                "Servi il pasto.",
              ],
            })));
            return { choices: [{ message: { content: JSON.stringify({ items }) }, finish_reason: "stop" }] };
          },
        },
      },
    },
  };
}

test("body reale → route parser → prompt → mock → piano finale: ogni allergene resta entro il budget globale", async (t) => {
  for (const scenario of ALLERGEN_CASES) {
    const prepared = await prepareMealPlanPreferences(
      "meal-plan-allergen-audit-user",
      { diet: scenario.preferences.diet, allergies: scenario.preferences.allergies, notes: scenario.preferences.notes },
      async () => true,
    );
    assert.equal(prepared.ok, true, `${scenario.name}: il body frontend deve essere accettato`);
    if (!prepared.ok) continue;

    const { client, calls } = createAllergenAuditClient();
    __setOpenAiClientForTest(client);
    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: "2026-08-03",
      preferences: prepared.preferences,
      maxModelCalls: MAX_MEAL_PLAN_MODEL_CALLS,
      suppressInternalLogs: true,
    });

    assert.equal(plan.items.length, 21, `${scenario.name}: piano completo`);
    assert.deepEqual(validateMealPlanConstraints(plan.items, prepared.preferences), [], `${scenario.name}: piano finale verificato`);
    assert.ok(calls.length <= MAX_MEAL_PLAN_MODEL_CALLS, `${scenario.name}: budget massimo invariato`);
    assert.equal(
      calls.length,
      scenario.exclusion === "lactose" ? 7 : 14,
      `${scenario.name}: chiamate mock previste senza retry`,
    );
    assert.ok(calls.every((call) =>
      new RegExp(`Esclusioni canoniche applicate:.*\\b${scenario.exclusion}\\b`, "i").test(call.prompt),
    ), `${scenario.name}: vincolo propagato in ogni prompt`);
    assert.ok(calls.every((call) => (call.ingredientNames || []).every((ingredient) =>
      validateMealPlanConstraints([{ title: ingredient, ingredients: [{ name: ingredient }] }], prepared.preferences).length === 0,
    )), `${scenario.name}: enum ingredienti sicuro`);
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("combinazioni supportate conservano ogni vincolo fino al piano mock verificato oppure la route restituisce un errore chiaro", async (t) => {
  const combinations: Array<{ preferences: MealPlanConstraintPreferences; exclusions: MealPlanExclusion[] }> = [
    { preferences: { diet: "mediterranea senza glutine", allergies: "lattosio" }, exclusions: ["gluten", "lactose"] },
    { preferences: { diet: "vegana senza glutine", allergies: "noce" }, exclusions: ["gluten", "nuts"] },
    { preferences: { diet: "vegetariana", allergies: "latte e uova" }, exclusions: ["milk", "egg"] },
    { preferences: { allergies: "pesce e arachidi" }, exclusions: ["peanut", "fish"] },
  ];

  for (const scenario of combinations) {
    const prepared = await prepareMealPlanPreferences("meal-plan-allergen-audit-user", scenario.preferences, async () => true);
    assert.equal(prepared.ok, true, JSON.stringify(scenario.preferences));
    if (!prepared.ok) continue;
    assert.deepEqual(normalizeMealPlanConstraints(prepared.preferences).exclusions, scenario.exclusions);
    for (const exclusion of scenario.exclusions) {
      const representative = ALLERGEN_CASES.find((allergen) => allergen.exclusion === exclusion)!;
      assert.ok(
        validateMealPlanConstraints([recipeWith(representative.forbidden, "ingredients")], prepared.preferences)
          .some((violation) => violation.code === exclusion),
        `${JSON.stringify(scenario.preferences)}: ${exclusion} non si allenta`,
      );
    }

    const { client, calls } = createAllergenAuditClient();
    __setOpenAiClientForTest(client);
    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: "2026-08-03",
      preferences: prepared.preferences,
      maxModelCalls: MAX_MEAL_PLAN_MODEL_CALLS,
      suppressInternalLogs: true,
    });
    assert.equal(plan.items.length, 21, `${JSON.stringify(scenario.preferences)}: piano completo`);
    assert.deepEqual(validateMealPlanConstraints(plan.items, prepared.preferences), [], `${JSON.stringify(scenario.preferences)}: piano finale verificato`);
    assert.equal(
      calls.length,
      scenario.exclusions.length === 1 && scenario.exclusions.includes("lactose") ? 7 : 14,
      `${JSON.stringify(scenario.preferences)}: chiamate mock previste senza retry`,
    );
    assert.ok(calls.length <= MAX_MEAL_PLAN_MODEL_CALLS, `${JSON.stringify(scenario.preferences)}: budget massimo`);
    for (const exclusion of scenario.exclusions) {
      assert.ok(calls.every((call) =>
        new RegExp(`Esclusioni canoniche applicate:.*\\b${exclusion}\\b`, "i").test(call.prompt),
      ), `${JSON.stringify(scenario.preferences)}: ${exclusion} in ogni prompt`);
    }
  }
  t.after(() => __setOpenAiClientForTest(null));

  const blocked = await prepareMealPlanPreferences(
    "meal-plan-allergen-audit-user",
    { notes: "Sono diabetico e allergico alle arachidi" },
    async () => true,
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.code, "UNSUPPORTED_ALLERGY_NOTE");
  }
});