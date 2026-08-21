import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMealPlanVarietyContext,
  evaluateMealPlanVariety,
  mealPlanLunchBase,
  mealPlanLunchSignature,
  planMealPlanLunchFamilies,
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

test("la rotazione locale distribuisce sette famiglie compatibili senza affidarsi al modello", () => {
  const targets = planMealPlanLunchFamilies([
    "pasta", "riso", "ceci", "couscous", "farro", "patate", "quinoa",
  ]);

  assert.deepEqual(targets, [
    "pasta", "risotto/riso", "piatto di legumi", "couscous",
    "cereale in chicco", "patate/polenta", "quinoa",
  ]);
  assert.equal(new Set(targets).size, 7);
  assert.deepEqual(
    planMealPlanLunchFamilies([
      "pasta", "riso", "ceci", "couscous", "farro", "patate", "quinoa",
      "pane", "insalata",
    ], 7, 1),
    [
      "risotto/riso", "piatto di legumi", "couscous", "cereale in chicco",
      "patate/polenta", "quinoa", "pasta",
    ],
    "il Piano B ruota le stesse sette famiglie primarie",
  );
});

test("sei paste mediterranee con contorni diversi restano un caso monotono", () => {
  const lunches = [
    meal("lunch", "Pasta al pomodoro e tonno", ["pasta", "pomodori", "tonno", "insalata"]),
    meal("lunch", "Pasta al pomodoro con tonno e basilico", ["pasta", "pomodori", "tonno", "basilico"]),
    meal("lunch", "Pasta al pomodoro con pollo e zucchine", ["pasta", "pomodori", "pollo", "zucchine"]),
    meal("lunch", "Pasta al pomodoro con tonno e olio", ["pasta", "pomodori", "tonno", "olio extravergine di oliva"]),
    meal("lunch", "Pasta al pomodoro con pollo e insalata", ["pasta", "pomodori", "pollo", "insalata"]),
    meal("lunch", "Pasta al pomodoro con tonno e prezzemolo", ["pasta", "pomodori", "tonno", "prezzemolo"]),
    meal("lunch", "Risotto con zucchine e merluzzo", ["riso", "zucchine", "merluzzo"]),
  ];
  const evaluation = evaluateMealPlanVariety(lunches);

  assert.equal(mealPlanLunchBase(lunches[0]), "pasta + pomodoro");
  assert.equal(mealPlanLunchBase(lunches[5]), "pasta + pomodoro");
  assert.equal(evaluation.lunchFamilyCounts.pasta, 6);
  assert.equal(evaluation.lunchBaseCounts["pasta + pomodoro"], 6);
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "excessive_lunch_family" && issue.source === "pasta" && issue.count === 6));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_base" && issue.source === "pasta + pomodoro" && issue.count === 6));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_carbohydrate" && issue.source === "pasta" && issue.count === 6));
  assert.ok(evaluation.issues.some((issue) => issue.code === "low_lunch_family_variety"));
  assert.match(buildMealPlanVarietyContext(lunches), /LUNCH FAMILY COUNTS/i);
  assert.match(buildMealPlanVarietyContext(lunches), /LUNCH BASE COUNTS/i);
  assert.match(buildMealPlanVarietyContext(lunches), /LUNCH PROTEIN COUNTS/i);
  assert.match(buildMealPlanVarietyContext(lunches), /AVOID NEXT/i);
});

test("contorni, erbe e pomodori laterali non cambiano base o firma del pranzo", () => {
  const variants = [
    meal("lunch", "Pasta al pesto con tonno", ["pasta", "pesto", "tonno", "insalata"]),
    meal("lunch", "Pasta al pesto con tonno", ["pasta", "pesto", "tonno", "pomodori", "olio extravergine di oliva"]),
    meal("lunch", "Pasta al pesto con tonno", ["pasta", "pesto", "tonno", "basilico", "prezzemolo"]),
  ];
  const evaluation = evaluateMealPlanVariety(variants);

  assert.deepEqual(variants.map(mealPlanLunchBase), [
    "pasta + pesto", "pasta + pesto", "pasta + pesto",
  ]);
  assert.deepEqual(variants.map((item) => mealPlanLunchSignature(item)), [
    "pasta + pesto + tonno", "pasta + pesto + tonno", "pasta + pesto + tonno",
  ]);
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_base" && issue.source === "pasta + pesto" && issue.count === 3));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_pattern" && issue.source === "pasta + pesto + tonno" && issue.count === 3));
});

test("un piano con famiglie, basi e proteine alternate supera il controllo dei pranzi", () => {
  const lunches = [
    meal("lunch", "Pasta al pesto con tonno", ["pasta", "pesto", "tonno", "zucchine"]),
    meal("lunch", "Risotto al pomodoro con pollo", ["riso", "pomodori", "pollo", "peperoni"]),
    meal("lunch", "Ceci in umido con tacchino", ["ceci", "tacchino", "carote"]),
    meal("lunch", "Couscous con merluzzo e verdure", ["couscous", "merluzzo", "zucchine"]),
    meal("lunch", "Farro al forno con uova e spinaci", ["farro", "uova", "spinaci"]),
    meal("lunch", "Patate con salmone e broccoli", ["patate", "salmone", "broccoli"]),
    meal("lunch", "Quinoa con lenticchie e melanzane", ["quinoa", "lenticchie", "melanzane"]),
  ];
  const evaluation = evaluateMealPlanVariety(lunches);

  assert.ok(Object.keys(evaluation.lunchFamilyCounts).length >= 4);
  assert.equal(new Set(Object.keys(evaluation.lunchBaseCounts)).size, 7);
  assert.ok(!evaluation.issues.some((issue) =>
    ["low_lunch_family_variety", "excessive_lunch_family", "repeated_lunch_base",
      "repeated_lunch_pattern", "consecutive_lunch_pattern"].includes(issue.code)));
});