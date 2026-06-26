import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MEAL_PLAN_MAX_VARIANTS, resolveMealPlanVariants } from "../lib/ai-policy";

describe("resolveMealPlanVariants (prima pubblicazione: 1 sola variante)", () => {
  test("MEAL_PLAN_MAX_VARIANTS è 1", () => {
    assert.equal(MEAL_PLAN_MAX_VARIANTS, 1);
  });

  test("variants=2 NON consentito -> clampato a 1", () => {
    assert.equal(resolveMealPlanVariants(2), 1);
  });

  test("variants=1 -> 1", () => {
    assert.equal(resolveMealPlanVariants(1), 1);
  });

  test("valori alti -> 1", () => {
    assert.equal(resolveMealPlanVariants(5), 1);
    assert.equal(resolveMealPlanVariants(99), 1);
  });

  test("input non validi -> 1", () => {
    assert.equal(resolveMealPlanVariants(undefined), 1);
    assert.equal(resolveMealPlanVariants(null), 1);
    assert.equal(resolveMealPlanVariants("2"), 1);
    assert.equal(resolveMealPlanVariants(0), 1);
    assert.equal(resolveMealPlanVariants(-3), 1);
    assert.equal(resolveMealPlanVariants(NaN), 1);
  });
});
