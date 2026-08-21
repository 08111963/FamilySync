import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMealPlanVarietyContext,
  evaluateMealPlanVariety,
} from "../lib/meal-plan-variety";
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";

const meal = (
  mealType: "lunch" | "dinner",
  title: string,
  ingredients: string[],
) => ({
  mealType,
  title,
  ingredients: ingredients.map((name) => ({ name })),
});

test("il fixture monotono osservato viene segnalato senza essere trattato come non sicuro", () => {
  const items = [
    ...Array.from({ length: 5 }, (_, index) =>
      meal("lunch", `Riso al salmone ${index + 1}`, ["riso", "salmone", "zucchine"])),
    ...Array.from({ length: 3 }, (_, index) =>
      meal("dinner", `Riso con verdure ${index + 1}`, ["riso", "spinaci", "carote"])),
    ...Array.from({ length: 3 }, (_, index) =>
      meal("lunch", `Patate e legumi ${index + 1}`, ["patate", "ceci", "pomodori"])),
    ...Array.from({ length: 2 }, (_, index) =>
      meal("dinner", `Polenta con verdure ${index + 1}`, ["polenta di mais", "broccoli"])),
    meal("dinner", "Quinoa con verdure", ["quinoa", "broccoli"]),
  ];
  const evaluation = evaluateMealPlanVariety(items);

  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_carbohydrate" && issue.source === "riso/risotto" && issue.count === 8));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_protein" && issue.source === "salmone" && issue.count === 5));
  assert.ok(evaluation.issues.some((issue) => issue.code === "low_carbohydrate_variety"));
  assert.deepEqual(validateMealPlanConstraints(items, { allergies: "glutine" }), []);
});

test("una normale alternanza non viene segnalata per una singola ripetizione", () => {
  const items = [
    meal("lunch", "Pasta senza glutine con ceci", ["pasta senza glutine", "ceci", "zucchine"]),
    meal("dinner", "Merluzzo con patate", ["merluzzo", "patate", "spinaci"]),
    meal("lunch", "Risotto con tonno", ["riso", "tonno", "pomodori"]),
    meal("dinner", "Uova con polenta", ["uova", "polenta di mais", "bietole"]),
    meal("lunch", "Pasta di riso con tacchino", ["pasta di riso senza glutine", "tacchino", "peperoni"]),
    meal("dinner", "Quinoa con lenticchie", ["quinoa", "lenticchie", "carote"]),
  ];
  const evaluation = evaluateMealPlanVariety(items);

  assert.deepEqual(evaluation.issues, []);
  assert.match(buildMealPlanVarietyContext(items), /carboidrati principali usati/i);
  assert.match(buildMealPlanVarietyContext(items), /proteine principali usate/i);
});