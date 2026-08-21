import test from "node:test";
import assert from "node:assert/strict";
import { compatibleMealIngredients } from "../lib/openai";
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";
import {
  buildMealPlanVarietyContext,
  evaluateMealPlanVariety,
  mealPlanLunchFamily,
  mealPlanLunchSignature,
} from "../lib/meal-plan-variety";

const lunch = (date: string, title: string, ingredients: string[]) => ({
  date,
  mealType: "lunch",
  title,
  ingredients: ingredients.map((name) => ({ name })),
});

test("solo lattosio conserva un pool ampio e separa i prodotti senza lattosio dall'allergia al latte", () => {
  const breakfast = compatibleMealIngredients({ allergies: "lattosio" }, "breakfast");
  const main = compatibleMealIngredients({ allergies: "lattosio" }, "main");
  const milkAllergy = compatibleMealIngredients({ allergies: "latte" }, "main");

  for (const ingredient of [
    "pasta", "riso", "couscous", "farro", "orzo", "quinoa", "polenta di mais",
    "patate", "ceci", "lenticchie", "uova", "pollo", "merluzzo", "tonno",
  ]) {
    assert.ok(main.includes(ingredient), `${ingredient} deve restare nel pool principale lactose`);
  }
  assert.ok(breakfast.includes("yogurt senza lattosio"));
  assert.ok(main.includes("ricotta senza lattosio"));
  assert.ok(main.includes("mozzarella senza lattosio"));
  assert.ok(!main.includes("latte"));
  assert.ok(!milkAllergy.includes("yogurt senza lattosio"));
  assert.deepEqual(
    validateMealPlanConstraints(
      [{ title: "Yogurt senza lattosio", ingredients: [{ name: "yogurt senza lattosio" }] }],
      { allergies: "lattosio" },
    ),
    [],
  );
  assert.ok(validateMealPlanConstraints(
    [{ title: "Yogurt senza lattosio", ingredients: [{ name: "yogurt senza lattosio" }] }],
    { allergies: "latte" },
  ).length > 0);
});

test("le varianti di pasta pomodoro tonno hanno la stessa firma concettuale", () => {
  const variants = [
    lunch("2026-08-03", "Pasta al pomodoro e tonno", ["pasta", "pomodori", "tonno"]),
    lunch("2026-08-04", "Pasta al pomodoro con tonno e insalata", ["pasta", "pomodori", "tonno", "insalata"]),
    lunch("2026-08-05", "Pasta al pomodoro con tonno, olio e basilico", ["pasta", "pomodori", "tonno", "olio extravergine di oliva", "basilico"]),
  ];
  const signatures = variants.map(mealPlanLunchSignature);

  assert.deepEqual(signatures, [
    "pasta + tomato + tuna + pasta_main",
    "pasta + tomato + tuna + pasta_main",
    "pasta + tomato + tuna + pasta_main",
  ]);
  assert.deepEqual(variants.map(mealPlanLunchFamily), ["pasta", "pasta", "pasta"]);
});

test("famiglie di pranzo realmente diverse non vengono confuse con i duplicati", () => {
  const lunches = [
    lunch("2026-08-03", "Pasta al pomodoro e tonno", ["pasta", "pomodori", "tonno"]),
    lunch("2026-08-04", "Risotto con zucchine e pollo", ["riso", "zucchine", "pollo"]),
    lunch("2026-08-05", "Couscous con ceci e verdure", ["couscous", "ceci", "peperoni"]),
    lunch("2026-08-06", "Zuppa di lenticchie con pane", ["lenticchie", "pane", "carote"]),
  ];
  const signatures = lunches.map(mealPlanLunchSignature);

  assert.equal(new Set(signatures).size, 4);
  assert.deepEqual(lunches.map(mealPlanLunchFamily), [
    "pasta", "risotto/riso", "couscous", "zuppa",
  ]);
});

test("il fixture reale lactose 7/7 viene segnalato in modo esplicito", () => {
  const lunches = [
    lunch("2026-08-03", "Pasta al pomodoro e tonno", ["pasta", "pomodori", "tonno"]),
    lunch("2026-08-04", "Pasta al pomodoro con tonno e insalata", ["pasta", "pomodori", "tonno", "insalata"]),
    lunch("2026-08-05", "Pasta al pomodoro con pollo", ["pasta", "pomodori", "pollo"]),
    lunch("2026-08-06", "Pasta al pomodoro con tonno", ["pasta", "pomodori", "tonno"]),
    lunch("2026-08-07", "Pasta al pomodoro con tonno e basilico", ["pasta", "pomodori", "tonno", "basilico"]),
    lunch("2026-08-08", "Pasta al pomodoro con tonno e olio", ["pasta", "pomodori", "tonno", "olio extravergine di oliva"]),
    lunch("2026-08-09", "Pasta al pomodoro con tonno e aglio", ["pasta", "pomodori", "tonno", "aglio"]),
  ];
  const evaluation = evaluateMealPlanVariety(lunches);
  const context = buildMealPlanVarietyContext(lunches);

  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_pattern"
      && issue.source === "pasta + tomato + tuna + pasta_main" && issue.count === 6));
  assert.ok(evaluation.issues.some((issue) => issue.code === "consecutive_lunch_pattern"));
  assert.ok(evaluation.issues.some((issue) => issue.code === "low_lunch_family_variety" && issue.count === 1));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_carbohydrate" && issue.source === "pasta" && issue.count === 7));
  assert.match(context, /SEMANTIC LUNCH SIGNATURES USED/i);
  assert.match(context, /pasta \+ tomato \+ tuna \+ pasta_main/i);
  assert.match(context, /EVITA una firma semantica già usata/i);
  assert.deepEqual(validateMealPlanConstraints(lunches, { allergies: "lattosio" }), []);
});