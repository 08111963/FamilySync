import assert from "node:assert/strict";
import test from "node:test";
import {
  MEAL_PLAN_DIET_PROFILES,
  legacyMealPlanDietToProfile,
  mealPlanDietProfileLabel,
} from "../../shared/meal-plan-diet-profiles";
import {
  normalizeMealPlanConstraints,
  mealPlanRequiresMediterraneanRedMeat,
  validateMealPlanConstraints,
} from "../lib/meal-plan-constraints";

test("tutti i profili sono canonici, localizzabili e senza combinazioni libere", () => {
  assert.deepEqual(MEAL_PLAN_DIET_PROFILES, [
    "mediterranean",
    "balanced",
    "vegetarian",
    "light",
    "sport",
    "gluten_free",
    "lactose_free",
  ]);
  for (const profile of MEAL_PLAN_DIET_PROFILES) {
    const normalized = normalizeMealPlanConstraints({ dietProfile: profile });
    assert.equal(normalized.source.dietProfile, profile);
    assert.ok(mealPlanDietProfileLabel(profile, "it"));
    assert.ok(mealPlanDietProfileLabel(profile, "en"));
  }
});

test("i profili senza glutine e lattosio applicano solo le loro sostituzioni esplicite", () => {
  const gluten = validateMealPlanConstraints(
    [{ title: "Pasta", ingredients: [{ name: "pasta" }] }],
    { dietProfile: "gluten_free" },
  );
  assert.equal(gluten[0]?.code, "gluten");
  assert.equal(validateMealPlanConstraints(
    [{ title: "Pasta senza glutine", ingredients: [{ name: "pasta di riso senza glutine" }] }],
    { dietProfile: "gluten_free" },
  ).length, 0);
  assert.equal(validateMealPlanConstraints(
    [{ title: "Yogurt", ingredients: [{ name: "yogurt" }] }],
    { dietProfile: "lactose_free" },
  )[0]?.code, "lactose");
  assert.equal(validateMealPlanConstraints(
    [{ title: "Yogurt senza lattosio", ingredients: [{ name: "yogurt senza lattosio" }] }],
    { dietProfile: "lactose_free" },
  ).length, 0);
});

test("compatibilità legacy: solo le combinazioni mediterranee rappresentabili restano convertibili", () => {
  const item = [{ title: "Tagliata di manzo", ingredients: [{ name: "manzo" }] }];
  assert.equal(validateMealPlanConstraints(item, { dietProfile: "vegetarian" })[0]?.code, "meat");
  assert.deepEqual(normalizeMealPlanConstraints({
    dietProfile: "mediterranean",
    allergies: "glutine, arachidi",
  }).exclusions, []);
  assert.equal(legacyMealPlanDietToProfile("vegetariana"), "vegetarian");
  assert.equal(legacyMealPlanDietToProfile("Mediterranea senza glutine"), "gluten_free");
  assert.equal(legacyMealPlanDietToProfile("Mediterranea senza lattosio"), "lactose_free");
  for (const legacyProfile of [
    "vegetarian_gluten_free",
    "vegana",
    "vegan",
    "pescetariana",
    "pescetarian",
    "low carb",
    "low_carb",
    "chetogenica",
    "keto",
    "halal",
  ]) {
    assert.equal(
      legacyMealPlanDietToProfile(legacyProfile),
      undefined,
      `${legacyProfile} richiede una nuova scelta esplicita`,
    );
  }
  assert.equal(legacyMealPlanDietToProfile("Solo cibi della mia infanzia"), undefined);
});

test("i profili mediterranei e le due varianti separate mantengono l'equilibrio settimanale", () => {
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "mediterranean" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "gluten_free" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "lactose_free" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "vegetarian" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "balanced" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "light" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "sport" }), false);
});