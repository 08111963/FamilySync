import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMealPlanVarietyContext,
  evaluateMealPlanRedMeat,
  evaluateMealPlanVariety,
  mealPlanLunchBase,
  mealPlanLunchProteinPreparation,
  mealPlanLunchSemanticSignature,
  mealPlanLunchSignature,
  planMealPlanLunchFamilies,
  planMealPlanLunchSemanticTargets,
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
  assert.deepEqual(validateMealPlanConstraints(items, { dietProfile: "gluten_free" }), []);
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

  const semanticTargets = planMealPlanLunchSemanticTargets([
    "pasta", "riso", "ceci", "couscous", "farro", "patate", "quinoa",
    "salmone", "tonno", "pollo", "tacchino", "uova", "limone", "pomodori",
    "pesto", "zucchine",
  ]);
  assert.equal(new Set(semanticTargets.map((target) =>
    `${target.mainProtein} + ${target.preparation}`)).size, 7);
});

test("il blueprint mediterraneo impone una carne rossa e il controllo conta pranzo più cena", () => {
  const ingredients = [
    "pasta", "riso", "ceci", "couscous", "farro", "patate", "quinoa",
    "salmone", "tonno", "pollo", "tacchino", "uova", "manzo",
    "limone", "pomodori", "pesto", "zucchine",
  ];
  const targets = planMealPlanLunchSemanticTargets(ingredients, 7, 0, {
    requireRedMeat: true,
  });
  assert.equal(targets.filter((target) => target.mainProtein === "red_meat").length, 1);

  const withRedMeat = [
    meal("lunch", "Riso con manzo e zucchine", ["riso", "manzo", "zucchine"]),
    meal("dinner", "Merluzzo con patate", ["merluzzo", "patate", "bietole"]),
  ];
  assert.deepEqual(evaluateMealPlanRedMeat(withRedMeat), {
    mainMealCount: 2,
    redMeatMealCount: 1,
    hasRedMeat: true,
  });

  const withoutRedMeat = [
    meal("lunch", "Riso con ceci e zucchine", ["riso", "ceci", "zucchine"]),
    meal("dinner", "Merluzzo con patate", ["merluzzo", "patate", "bietole"]),
  ];
  assert.deepEqual(evaluateMealPlanRedMeat(withoutRedMeat), {
    mainMealCount: 2,
    redMeatMealCount: 0,
    hasRedMeat: false,
  }, "l'assenza resta un advisory locale, senza una rigenerazione completa");
});

test("il target carne rossa è opzionale per i profili non mediterranei", () => {
  const glutenFreeIngredients = [
    "pasta senza glutine", "riso", "ceci", "patate", "quinoa",
    "manzo", "salmone", "pollo", "zucchine", "pomodori",
  ];
  assert.ok(
    !planMealPlanLunchSemanticTargets(
      glutenFreeIngredients.filter((ingredient) => ingredient !== "manzo"),
      7,
      0,
      { requireRedMeat: false },
    ).some((target) => target.mainProtein === "red_meat"),
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
    "pasta + pesto + tuna + pasta_main",
    "pasta + pesto + tuna + pasta_main",
    "pasta + pesto + tuna + pasta_main",
  ]);
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_base" && issue.source === "pasta + pesto" && issue.count === 3));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_semantic_signature"
      && issue.source === "pasta + pesto + tuna + pasta_main" && issue.count === 3));
});

test("le firme semantiche uniscono varianti equivalenti senza confondere piatti diversi", () => {
  const duplicatePairs = [
    [
      meal("lunch", "Risotto al limone con salmone e insalata", ["risotto", "limone", "salmone", "insalata"]),
      meal("lunch", "Riso al limone con salmone e pomodori", ["riso basmati", "limone", "salmone", "pomodori"]),
      "rice + lemon + salmon + grain_main",
    ],
    [
      meal("lunch", "Pasta al pomodoro con tonno e insalata", ["pasta", "pomodori", "tonno", "insalata"]),
      meal("lunch", "Spaghetti al pomodoro con tonno e verdure", ["spaghetti", "pomodori", "tonno", "zucchine"]),
      "pasta + tomato + tuna + pasta_main",
    ],
    [
      meal("lunch", "Riso con pollo e zucchine", ["riso", "pollo", "zucchine"]),
      meal("lunch", "Risotto con pollo e zucchine", ["risotto", "pollo", "zucchine"]),
      "rice + simple + chicken + grain_main",
    ],
  ] as const;

  for (const [first, second, signature] of duplicatePairs) {
    assert.equal(mealPlanLunchSemanticSignature(first), signature);
    assert.equal(mealPlanLunchSemanticSignature(second), signature);
  }

  const riceSalmon = duplicatePairs[0]!;
  const evaluation = evaluateMealPlanVariety([riceSalmon[0], riceSalmon[1]]);
  assert.equal(mealPlanLunchProteinPreparation(riceSalmon[0]), "salmon + lemon");
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_semantic_signature"
      && issue.source === "rice + lemon + salmon + grain_main" && issue.count === 2));
  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_protein_preparation"
      && issue.source === "salmon + lemon" && issue.count === 2));

  assert.notEqual(
    mealPlanLunchSemanticSignature(meal("lunch", "Risotto al limone con salmone", ["riso", "limone", "salmone"])),
    mealPlanLunchSemanticSignature(meal("lunch", "Riso con ceci e verdure", ["riso", "ceci", "zucchine"])),
  );
  assert.notEqual(
    mealPlanLunchSemanticSignature(meal("lunch", "Pasta al pomodoro con tonno", ["pasta", "pomodori", "tonno"])),
    mealPlanLunchSemanticSignature(meal("lunch", "Pasta con crema di zucchine e pollo", ["pasta", "zucchine", "pollo"])),
  );
});

test("la settimana reale segnala riso-limone-salmone anche a giorni non consecutivi", () => {
  const lunches = [
    meal("lunch", "Pasta al pomodoro con tonno e insalata", ["pasta", "pomodori", "tonno", "insalata"]),
    meal("lunch", "Risotto al limone con salmone e fagiolini", ["risotto", "limone", "salmone", "fagiolini"]),
    meal("lunch", "Zuppa di lenticchie con pane", ["lenticchie", "pane", "carote"]),
    meal("lunch", "Couscous alle verdure e ceci", ["couscous", "ceci", "zucchine"]),
    meal("lunch", "Riso al limone con salmone e zucchine", ["riso", "limone", "salmone", "zucchine"]),
    meal("lunch", "Polenta con spezzatino di pollo", ["polenta", "pollo", "carote"]),
    meal("lunch", "Insalata di quinoa con ceci e verdure", ["quinoa", "ceci", "rucola"]),
  ];
  const evaluation = evaluateMealPlanVariety(lunches);

  assert.ok(evaluation.issues.some((issue) =>
    issue.code === "repeated_lunch_semantic_signature"
      && issue.source === "rice + lemon + salmon + grain_main" && issue.count === 2));
  assert.match(buildMealPlanVarietyContext(lunches), /SEMANTIC LUNCH SIGNATURES USED/i);
  assert.match(buildMealPlanVarietyContext(lunches), /DO NOT REPEAT/i);
  assert.match(buildMealPlanVarietyContext(lunches), /rice \+ lemon \+ salmon \+ grain_main/i);
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
      "repeated_lunch_pattern", "repeated_lunch_semantic_signature",
      "repeated_lunch_protein_preparation", "consecutive_lunch_pattern"].includes(issue.code)));
});