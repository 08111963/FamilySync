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
  assert.equal(MEAL_PLAN_DIET_PROFILES.length, 9);
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
    { dietProfile: "mediterranean_gluten_free" },
  );
  assert.equal(gluten[0]?.code, "gluten");
  assert.equal(validateMealPlanConstraints(
    [{ title: "Pasta senza glutine", ingredients: [{ name: "pasta di riso senza glutine" }] }],
    { dietProfile: "mediterranean_gluten_free" },
  ).length, 0);
  assert.equal(validateMealPlanConstraints(
    [{ title: "Yogurt", ingredients: [{ name: "yogurt" }] }],
    { dietProfile: "mediterranean_lactose_free" },
  )[0]?.code, "lactose");
  assert.equal(validateMealPlanConstraints(
    [{ title: "Yogurt senza lattosio", ingredients: [{ name: "yogurt senza lattosio" }] }],
    { dietProfile: "mediterranean_lactose_free" },
  ).length, 0);
});

test("vegetariano e vegano rifiutano carne rossa senza leggere allergies legacy", () => {
  const item = [{ title: "Tagliata di manzo", ingredients: [{ name: "manzo" }] }];
  assert.equal(validateMealPlanConstraints(item, { dietProfile: "vegetarian" })[0]?.code, "meat");
  assert.equal(validateMealPlanConstraints(item, { dietProfile: "vegan" })[0]?.code, "meat");
  assert.deepEqual(normalizeMealPlanConstraints({
    dietProfile: "mediterranean",
    allergies: "glutine, arachidi",
  }).exclusions, []);
  assert.equal(legacyMealPlanDietToProfile("vegetariana"), "vegetarian");
});

test("solo i profili mediterranei che consentono carne richiedono la carne rossa settimanale", () => {
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "mediterranean" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "mediterranean_gluten_free" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "mediterranean_lactose_free" }), true);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "vegetarian" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "vegetarian_gluten_free" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "vegan" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "pescetarian" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "low_carb" }), false);
  assert.equal(mealPlanRequiresMediterraneanRedMeat({ dietProfile: "halal" }), false);
});