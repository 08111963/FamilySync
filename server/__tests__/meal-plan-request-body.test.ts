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
    preferences: { dietProfile: "mediterranean_gluten_free" },
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
    preferences: { dietProfile: "mediterranean_lactose_free" },
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

test("diet e allergies legacy non creano esclusioni dal body frontend", async () => {
  const [diet, allergies] = await Promise.all([
    prepareMealPlanPreferences(userId, { diet: "senza glutine" }, allowedConsent),
    prepareMealPlanPreferences(userId, { allergies: "glutine" }, allowedConsent),
  ]);
  assert.equal(diet.ok, true);
  assert.equal(allergies.ok, true);
  if (!diet.ok || !allergies.ok) return;
  assert.deepEqual(normalizeMealPlanConstraints(diet.preferences).exclusions, []);
  assert.deepEqual(normalizeMealPlanConstraints(allergies.preferences).exclusions, []);
  assert.deepEqual(diet.preferences, { dietProfile: "mediterranean" });
  assert.deepEqual(allergies.preferences, { dietProfile: "mediterranean" });
});