import test from "node:test";
import assert from "node:assert/strict";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import {
  buildMealPlanConstraintPrompt,
  normalizeMealPlanConstraints,
  validateMealPlanConstraints,
} from "../lib/meal-plan-constraints";
import {
  __setOpenAiClientForTest,
  compatibleMealIngredients,
  generateWeeklyMealPlan,
  MAX_MEAL_PLAN_MODEL_CALLS,
} from "../lib/openai";
import { prepareMealPlanPreferences } from "../routes/ai";
import type { MealPlanDietProfile } from "../../shared/meal-plan-diet-profiles";

type ProfileCase = {
  name: string;
  profile: MealPlanDietProfile;
  dietaryPattern: string;
  exclusions: string[];
  forbidden?: string;
  violationCode?: string;
  safe: string;
};

/**
 * Inventario dei soli profili chiusi dichiarati dal prodotto. Il test non
 * deduce mai vincoli dai campi legacy diet/allergies.
 */
const PROFILE_CASES: ProfileCase[] = [
  { name: "mediterraneo", profile: "mediterranean", dietaryPattern: "mediterranean", exclusions: [], safe: "riso" },
  { name: "mediterraneo senza glutine", profile: "mediterranean_gluten_free", dietaryPattern: "mediterranean", exclusions: ["gluten"], forbidden: "pasta", violationCode: "gluten", safe: "pasta senza glutine" },
  { name: "mediterraneo senza lattosio", profile: "mediterranean_lactose_free", dietaryPattern: "mediterranean", exclusions: ["lactose"], forbidden: "ricotta", violationCode: "lactose", safe: "yogurt senza lattosio" },
  { name: "vegetariano", profile: "vegetarian", dietaryPattern: "vegetarian", exclusions: [], forbidden: "pollo", violationCode: "meat", safe: "ceci" },
  { name: "vegetariano senza glutine", profile: "vegetarian_gluten_free", dietaryPattern: "vegetarian", exclusions: ["gluten"], forbidden: "pasta", violationCode: "gluten", safe: "pasta senza glutine" },
  { name: "vegano", profile: "vegan", dietaryPattern: "vegan", exclusions: [], forbidden: "yogurt", violationCode: "milk", safe: "tofu" },
  { name: "pescetariano", profile: "pescetarian", dietaryPattern: "pescetarian", exclusions: [], forbidden: "pollo", violationCode: "meat", safe: "merluzzo" },
  { name: "low carb", profile: "low_carb", dietaryPattern: "low-carb", exclusions: [], forbidden: "pasta", violationCode: "low-carb", safe: "uova" },
  { name: "halal", profile: "halal", dietaryPattern: "halal", exclusions: [], forbidden: "maiale", violationCode: "halal", safe: "riso" },
];

function recipeWith(value: string, field: "title" | "description" | "notes" | "ingredients" | "steps") {
  return {
    title: field === "title" ? value : "Pasto compatibile",
    description: field === "description" ? value : "Preparazione compatibile",
    notes: field === "notes" ? value : "Nessuna nota",
    ingredients: [{ name: field === "ingredients" ? value : "quinoa" }],
    steps: [
      field === "steps" ? value : "Lava gli ingredienti.",
      "Cuoci gli ingredienti indicati.",
      "Assembla e servi il pasto.",
    ],
  };
}

test("audit parametrico: tutti i dietProfile chiusi normalizzano e validano il pool sicuro", () => {
  for (const scenario of PROFILE_CASES) {
    const preferences = { dietProfile: scenario.profile };
    const normalized = normalizeMealPlanConstraints(preferences);
    assert.equal(normalized.source.dietProfile, scenario.profile, `${scenario.name}: profilo`);
    assert.deepEqual(normalized.dietaryPatterns, [scenario.dietaryPattern], `${scenario.name}: pattern`);
    assert.deepEqual(normalized.exclusions, scenario.exclusions, `${scenario.name}: esclusioni`);
    assert.match(
      buildMealPlanConstraintPrompt(preferences),
      new RegExp(`Pattern alimentari canonici applicati:.*\\b${scenario.dietaryPattern}\\b`, "i"),
      `${scenario.name}: pattern nel prompt`,
    );
    for (const exclusion of scenario.exclusions) {
      assert.match(
        buildMealPlanConstraintPrompt(preferences),
        new RegExp(`Esclusioni canoniche applicate:.*\\b${exclusion}\\b`, "i"),
        `${scenario.name}: ${exclusion} nel prompt`,
      );
    }
    if (scenario.forbidden && scenario.violationCode) {
      for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
        const violations = validateMealPlanConstraints([recipeWith(scenario.forbidden, field)], preferences);
        assert.ok(
          violations.some((violation) => violation.code === scenario.violationCode),
          `${scenario.name}: ${field} deve bloccare ${scenario.forbidden}`,
        );
      }
    }
    for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
      assert.deepEqual(
        validateMealPlanConstraints([recipeWith(scenario.safe, field)], preferences),
        [],
        `${scenario.name}: ${field} accetta solo il marker sicuro documentato`,
      );
    }
    if (scenario.exclusions.includes("gluten")) {
      const glutenBypassAttempts = [
        "gallette di riso con pasta senza glutine",
        "pasta senza glutine con pasta",
        "gallette di riso senza glutine con gallette di riso",
        "pasta senza glutine con glutine aggiunto",
      ];
      for (const field of ["title", "description", "notes", "ingredients", "steps"] as const) {
        for (const text of glutenBypassAttempts) {
          const bypassAttempt = validateMealPlanConstraints([recipeWith(text, field)], preferences);
          assert.ok(
            bypassAttempt.some((violation) => violation.code === "gluten"),
            `glutine: ${field} non deve estendere il marker sicuro a un'altra occorrenza (${text})`,
          );
        }
      }
    }

    const pool = compatibleMealIngredients(preferences, "main");
    assert.ok(pool.length > 0, `${scenario.name}: pool principale disponibile`);
    for (const ingredient of pool) {
      assert.deepEqual(
        validateMealPlanConstraints([{ title: ingredient, ingredients: [{ name: ingredient }] }], preferences),
        [],
        `${scenario.name}: pool compatibile (${ingredient})`,
      );
    }

  }
});

type MockCall = { prompt: string; ingredientNames: string[] | undefined };

function createAllergenAuditClient(includeMediterraneanRedMeat = false) {
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
            const items = dates.flatMap((date) => mealTypes.map((mealType) => ({
              date,
              mealType,
              // Il mock deve esercitare il generatore senza introdurre un
              // doppione artificiale nello stesso tipo di pasto.
              title: `Ricetta ${mealType} compatibile ${date}`,
              description: "Ricetta sintetica compatibile.",
              ingredients: [{
                name: includeMediterraneanRedMeat &&
                    mealType === "dinner" &&
                    date === dates[0] &&
                    ingredientNames?.includes("manzo")
                  ? "manzo"
                  : ingredientNames?.[0] || "mela",
                quantity: "1",
                unit: "pezzo",
              }],
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

test("body reale → route parser → prompt → mock → piano finale: ogni dietProfile resta entro il budget globale", async (t) => {
  for (const scenario of PROFILE_CASES) {
    const prepared = await prepareMealPlanPreferences(
      "meal-plan-allergen-audit-user",
      { dietProfile: scenario.profile },
      async () => true,
    );
    assert.equal(prepared.ok, true, `${scenario.name}: il body frontend deve essere accettato`);
    if (!prepared.ok) continue;

    const { client, calls } = createAllergenAuditClient(
      scenario.profile.startsWith("mediterranean"),
    );
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
      7,
      `${scenario.name}: chiamate mock previste senza retry`,
    );
    assert.ok(calls.every((call) =>
      new RegExp(`Pattern alimentari canonici applicati:.*\\b${scenario.dietaryPattern}\\b`, "i").test(call.prompt),
    ), `${scenario.name}: profilo propagato in ogni prompt`);
    for (const exclusion of scenario.exclusions) {
      assert.ok(calls.every((call) =>
        new RegExp(`Esclusioni canoniche applicate:.*\\b${exclusion}\\b`, "i").test(call.prompt),
      ), `${scenario.name}: ${exclusion} in ogni prompt`);
    }
    assert.ok(calls.every((call) => (call.ingredientNames || []).every((ingredient) =>
      validateMealPlanConstraints([{ title: ingredient, ingredients: [{ name: ingredient }] }], prepared.preferences).length === 0,
    )), `${scenario.name}: enum ingredienti sicuro`);
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("diet e allergies legacy non raggiungono la pipeline quando è presente dietProfile", async () => {
  const prepared = await prepareMealPlanPreferences(
    "meal-plan-allergen-audit-user",
    { dietProfile: "mediterranean", diet: "Vegana", allergies: "glutine e arachidi" },
    async () => true,
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.preferences, { dietProfile: "mediterranean" });
  assert.deepEqual(normalizeMealPlanConstraints(prepared.preferences).exclusions, []);

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