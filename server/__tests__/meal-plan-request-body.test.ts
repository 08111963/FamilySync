import test from "node:test";
import assert from "node:assert/strict";
import { prepareMealPlanPreferences } from "../routes/ai";
import {
  normalizeMealPlanConstraints,
  validateMealPlanConstraints,
} from "../lib/meal-plan-constraints";

const userId = "meal-plan-request-body-test-user";
const allowedConsent = async () => true;

test("body reale dietProfile senza glutine attraversa parser route e normalizzazione", async () => {
  const body = {
    weekStartDate: "2026-08-24",
    preferences: { dietProfile: "gluten_free" },
  };
  const prepared = await prepareMealPlanPreferences(userId, body.preferences, allowedConsent);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(normalizeMealPlanConstraints(prepared.preferences).exclusions, ["gluten"]);
  assert.ok(
    validateMealPlanConstraints(
      [{ title: "Pasta di semola", ingredients: [{ name: "Pasta di semola" }] }],
      prepared.preferences,
    ).some((violation) => violation.code === "gluten"),
  );
});

test("body reale dietProfile senza lattosio attraversa parser route e normalizzazione", async () => {
  const body = {
    weekStartDate: "2026-08-24",
    preferences: { dietProfile: "lactose_free" },
  };
  const prepared = await prepareMealPlanPreferences(userId, body.preferences, allowedConsent);

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(normalizeMealPlanConstraints(prepared.preferences).exclusions, ["lactose"]);
  assert.ok(
    validateMealPlanConstraints(
      [{ title: "Pasta con burro", ingredients: [{ name: "Pasta" }, { name: "Burro" }] }],
      prepared.preferences,
    ).some((violation) => violation.code === "lactose"),
  );
});

test("i valori legacy combinati vengono normalizzati senza leggere allergies", async () => {
  const [diet, allergies] = await Promise.all([
    prepareMealPlanPreferences(userId, { dietProfile: "mediterranean_gluten_free" }, allowedConsent),
    prepareMealPlanPreferences(userId, { allergies: "glutine" }, allowedConsent),
  ]);
  assert.equal(diet.ok, true);
  assert.equal(allergies.ok, true);
  if (!diet.ok || !allergies.ok) return;
  assert.deepEqual(normalizeMealPlanConstraints(diet.preferences).exclusions, ["gluten"]);
  assert.deepEqual(normalizeMealPlanConstraints(allergies.preferences).exclusions, []);
  assert.deepEqual(diet.preferences, { dietProfile: "gluten_free" });
  assert.deepEqual(allergies.preferences, { dietProfile: "mediterranean" });
});

test("i profili ancora non rappresentabili richiedono una nuova selezione e non diventano permissivi", async () => {
  for (const field of ["dietProfile", "diet"] as const) {
    for (const legacyProfile of [
      "pescetarian",
      "halal",
      "low_carb",
    ]) {
      const prepared = await prepareMealPlanPreferences(
        userId,
        { [field]: legacyProfile },
        allowedConsent,
      );
      assert.equal(prepared.ok, false, `${field}=${legacyProfile}`);
      if (prepared.ok) continue;
      assert.equal(prepared.status, 422, `${field}=${legacyProfile}`);
      assert.equal(prepared.body.error.code, "UNSUPPORTED_DIET_PROFILE", `${field}=${legacyProfile}`);
      assert.match(prepared.body.error.message, /scegli.*profilo/i, `${field}=${legacyProfile}`);
    }
  }
});

test("vegana e i profili storici ritirati vengono normalizzati al catalogo attivo", async () => {
  const [vegan, balanced, vegetarianGlutenFree] = await Promise.all([
    prepareMealPlanPreferences(userId, { dietProfile: "vegan" }, allowedConsent),
    prepareMealPlanPreferences(userId, { diet: "balanced" }, allowedConsent),
    prepareMealPlanPreferences(userId, { dietProfile: "vegetarian_gluten_free" }, allowedConsent),
  ]);
  assert.deepEqual(vegan, { ok: true, preferences: { dietProfile: "vegan" } });
  assert.deepEqual(balanced, { ok: true, preferences: { dietProfile: "mediterranean" } });
  assert.deepEqual(vegetarianGlutenFree, { ok: true, preferences: { dietProfile: "gluten_free" } });
});

test("un valore mealsPerDay client non riduce né espande la settimana da 21 pasti", async () => {
  for (const mealsPerDay of [2, 4]) {
    const prepared = await prepareMealPlanPreferences(
      userId,
      { dietProfile: "vegan", mealsPerDay },
      allowedConsent,
    );
    assert.deepEqual(prepared, { ok: true, preferences: { dietProfile: "vegan" } }, String(mealsPerDay));
  }
});