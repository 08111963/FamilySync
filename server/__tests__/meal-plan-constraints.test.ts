import test from "node:test";
import assert from "node:assert/strict";
import {
  mealPlanHasExclusion,
  mealPlanPreferencesContainHealthData,
  normalizeMealPlanConstraints,
  extractMealPlanHealthConstraints,
  unsupportedMealPlanHealthNote,
  unsupportedMealPlanDiet,
  validateMealPlanConstraints,
} from "../lib/meal-plan-constraints";
import { compatibleMealIngredients } from "../lib/openai";

const ingredient = (name: string) => ({ name });

test("i nove dietProfile chiusi normalizzano nei soli pattern ed esclusioni supportati", () => {
  const cases = [
    ["mediterranean", ["mediterranean"], []],
    ["mediterranean_gluten_free", ["mediterranean"], ["gluten"]],
    ["mediterranean_lactose_free", ["mediterranean"], ["lactose"]],
    ["vegetarian", ["vegetarian"], []],
    ["vegetarian_gluten_free", ["vegetarian"], ["gluten"]],
    ["vegan", ["vegan"], []],
    ["pescetarian", ["pescetarian"], []],
    ["low_carb", ["low-carb"], []],
    ["halal", ["halal"], []],
  ] as const;

  for (const [dietProfile, dietaryPatterns, exclusions] of cases) {
    const normalized = normalizeMealPlanConstraints({ dietProfile });
    assert.deepEqual(normalized.dietaryPatterns, dietaryPatterns, dietProfile);
    assert.deepEqual(normalized.exclusions, exclusions, dietProfile);
    assert.equal(normalized.source.dietProfile, dietProfile, dietProfile);
  }
  assert.equal(mealPlanHasExclusion({ dietProfile: "mediterranean_gluten_free" }, "gluten"), true);
  assert.equal(mealPlanHasExclusion({ dietProfile: "mediterranean_lactose_free" }, "lactose"), true);
});

test("diet e allergies legacy non vengono propagati come vincoli", () => {
  const legacy = { diet: "Vegana senza glutine", allergies: "glutine, arachidi" };
  const normalized = normalizeMealPlanConstraints(legacy);

  assert.deepEqual(normalized.dietaryPatterns, []);
  assert.deepEqual(normalized.exclusions, []);
  assert.deepEqual(normalized.customExclusions, []);
  assert.equal(mealPlanHasExclusion(legacy, "gluten"), false);
  assert.equal(mealPlanPreferencesContainHealthData(legacy), false);
  assert.deepEqual(
    validateMealPlanConstraints(
      [{ title: "Pasta con arachidi", ingredients: [ingredient("Pasta"), ingredient("Arachidi")] }],
      legacy,
    ),
    [],
  );
});

test("il consenso salute considera solo le note, non il profilo o i campi legacy", () => {
  assert.equal(mealPlanPreferencesContainHealthData({ dietProfile: "mediterranean_gluten_free" }), false);
  assert.equal(mealPlanPreferencesContainHealthData({ diet: "Sono celiaca" }), false);
  assert.equal(mealPlanPreferencesContainHealthData({ allergies: "lattosio" }), false);
  assert.equal(mealPlanPreferencesContainHealthData({ notes: "Sono celiaca" }), true);
  assert.equal(mealPlanPreferencesContainHealthData({ notes: "intolleranza al lattosio" }), true);
});

test("allowlist senza glutine conserva prodotti dichiarati sicuri", () => {
  const preferences = { dietProfile: "mediterranean_gluten_free" } as const;
  const breakfast = compatibleMealIngredients(preferences, "breakfast");
  const main = compatibleMealIngredients(preferences, "main");
  for (const item of ["pane senza glutine", "fette biscottate senza glutine", "biscotti senza glutine"]) {
    assert.ok(breakfast.includes(item), item);
  }
  for (const item of ["pasta senza glutine", "pasta di mais senza glutine", "pasta di riso senza glutine", "couscous di mais senza glutine", "gnocchi senza glutine", "riso", "quinoa", "polenta di mais", "patate"]) {
    assert.ok(main.includes(item), item);
  }
  for (const unsafe of ["pasta", "pane", "couscous", "farro", "orzo", "biscotti"]) {
    assert.ok(!main.includes(unsafe), unsafe);
  }
});

test("allergia al glutine: pasta, pane e cereali non dichiarati senza glutine vengono rifiutati", () => {
  for (const title of ["Penne al tonno", "Pane tostato", "Yogurt con cereali"]) {
    const violations = validateMealPlanConstraints(
      [{ title, ingredients: [ingredient(title)] }],
      { dietProfile: "mediterranean_gluten_free" },
    );
    assert.ok(violations.some((violation) => violation.code === "gluten"), title);
  }
});

test("allergia al glutine: prodotti dichiarati senza glutine vengono accettati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Penne senza glutine al pomodoro",
      ingredients: [
        ingredient("Penne di mais senza glutine"),
        ingredient("Pomodoro"),
        ingredient("Olio extravergine"),
      ],
      steps: ["Cuoci le penne senza glutine e condiscile"],
    }],
    { dietProfile: "mediterranean_gluten_free" },
  );
  assert.deepEqual(violations, []);
});

test("il profilo mediterraneo senza glutine applica la validazione canonica", () => {
  const unsafe = [{ title: "Pasta comune", ingredients: [ingredient("Pasta di semola")] }];
  const safe = [{
    title: "Pasta senza glutine con ceci",
    ingredients: [ingredient("Pasta di mais senza glutine"), ingredient("Ceci")],
  }];
  const preferences = { dietProfile: "mediterranean_gluten_free" } as const;
  assert.ok(validateMealPlanConstraints(unsafe, preferences).some((violation) => violation.code === "gluten"));
  assert.deepEqual(validateMealPlanConstraints(safe, preferences), []);
});

test("un sostituto sicuro non rende sicuri altri ingredienti nello stesso testo", () => {
  const glutenViolations = validateMealPlanConstraints(
    [{
      title: "Pasta di riso con pane comune",
      ingredients: [ingredient("Pasta di riso con pane comune")],
    }],
    { dietProfile: "mediterranean_gluten_free" },
  );
  assert.ok(glutenViolations.some((violation) => violation.code === "gluten"));

  const veganViolations = validateMealPlanConstraints(
    [{
      title: "Latte vegetale con burro",
      ingredients: [ingredient("Latte vegetale con burro")],
    }],
    { dietProfile: "vegan" },
  );
  assert.ok(veganViolations.some((violation) => violation.code === "milk"));
});

test("dieta vegetariana: carne e pesce vengono rifiutati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Penne al tonno",
      ingredients: [ingredient("Penne"), ingredient("Tonno")],
    }],
    { dietProfile: "vegetarian" },
  );
  assert.ok(violations.some((violation) => violation.code === "fish"));
});

test("dieta vegana: latte, uova e miele vengono rifiutati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Yogurt con uova e miele",
      ingredients: [ingredient("Yogurt"), ingredient("Uova"), ingredient("Miele")],
    }],
    { dietProfile: "vegan" },
  );
  assert.deepEqual(
    new Set(violations.map((violation) => violation.code)),
    new Set(["milk", "egg", "honey"]),
  );
});

test("dieta vegana: sostituti vegetali espliciti vengono accettati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Yogurt vegetale con frutta",
      ingredients: [ingredient("Yogurt vegetale di soia"), ingredient("Fragole")],
    }],
    { dietProfile: "vegan" },
  );
  assert.deepEqual(violations, []);
});

test("intolleranza al lattosio: i passaggi possono riferirsi alla bevanda vegetale già dichiarata", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Porridge al latte caldo",
      ingredients: [
        ingredient("Latte di riso"),
        ingredient("Avena"),
        ingredient("Banana"),
      ],
      steps: [
        "Scalda il latte in un pentolino a fuoco basso.",
        "Unisci l'avena e mescola per cinque minuti.",
        "Completa con la banana a fettine e servi.",
      ],
    }],
    { dietProfile: "mediterranean_lactose_free" },
  );
  assert.deepEqual(violations, []);
});

test("intolleranza al lattosio: un'etichetta descrittiva non invalida ingredienti già sicuri", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Pasta con ceci e zucchine",
      description: "Piatto pensato per intolleranza al lattosio.",
      ingredients: [{ name: "pasta" }, { name: "ceci" }, { name: "zucchine" }],
      steps: [
        "Cuoci la pasta in acqua bollente.",
        "Scalda ceci e zucchine in padella.",
        "Unisci gli ingredienti e servi.",
      ],
    }],
    { dietProfile: "mediterranean_lactose_free" },
  );
  assert.deepEqual(violations, []);
});

test("intolleranza al lattosio: un latticino diverso e non dichiarato sicuro resta bloccato", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Pasta con panna",
      ingredients: [
        ingredient("Latte di riso"),
        ingredient("Pasta"),
        ingredient("Zucchine"),
      ],
      steps: [
        "Cuoci la pasta in acqua bollente.",
        "Aggiungi la panna alle zucchine in padella.",
        "Unisci la pasta e manteca per un minuto.",
      ],
    }],
    { dietProfile: "mediterranean_lactose_free" },
  );
  assert.ok(violations.some((violation) => violation.code === "lactose" && violation.matched === "panna"));
});

test("il profilo mediterraneo senza lattosio applica la validazione canonica", () => {
  const unsafe = [{ title: "Pasta con ricotta", ingredients: [ingredient("Pasta"), ingredient("Ricotta")] }];
  const safe = [{ title: "Pasta con ceci", ingredients: [ingredient("Pasta"), ingredient("Ceci")] }];
  const preferences = { dietProfile: "mediterranean_lactose_free" } as const;
  assert.ok(validateMealPlanConstraints(unsafe, preferences).some((violation) => violation.code === "lactose"));
  assert.deepEqual(validateMealPlanConstraints(safe, preferences), []);
});

test("il profilo vegano rifiuta anche prodotti senza lattosio che contengono latte", () => {
  const violations = validateMealPlanConstraints(
    [{ title: "Latte senza lattosio", ingredients: [ingredient("Latte senza lattosio")] }],
    { dietProfile: "vegan" },
  );
  assert.ok(violations.some((violation) => violation.code === "milk"));
});

test("i profili combinati esistono solo nel catalogo chiuso", () => {
  const cases = [
    { dietProfile: "mediterranean_gluten_free", expectedPatterns: ["mediterranean"], expectedExclusions: ["gluten"] },
    { dietProfile: "mediterranean_lactose_free", expectedPatterns: ["mediterranean"], expectedExclusions: ["lactose"] },
    { dietProfile: "vegetarian_gluten_free", expectedPatterns: ["vegetarian"], expectedExclusions: ["gluten"] },
  ] as const;
  for (const { expectedPatterns, expectedExclusions, ...preferences } of cases) {
    const normalized = normalizeMealPlanConstraints(preferences);
    assert.deepEqual(normalized.dietaryPatterns, expectedPatterns, JSON.stringify(preferences));
    assert.deepEqual(normalized.exclusions, expectedExclusions, JSON.stringify(preferences));
  }
});

test("un piano senza dietProfile non può avviare la generazione", () => {
  assert.match(
    unsupportedMealPlanDiet({ diet: "Solo cibi della mia infanzia" }) || "",
    /Scegli un profilo dieta/i,
  );
});

test("le note che esprimono allergie o esclusioni sono classificate come dati salute", () => {
  assert.equal(
    mealPlanPreferencesContainHealthData({ notes: "Non posso mangiare arachidi" }),
    true,
  );
  assert.equal(
    mealPlanPreferencesContainHealthData({ notes: "Ho avuto anafilassi alle noci" }),
    true,
  );
  assert.equal(
    mealPlanPreferencesContainHealthData({ notes: "Preferisco ricette veloci" }),
    false,
  );
});

test("le note sanitarie non vengono convertite in vincoli e restano bloccanti", () => {
  for (const notes of ["Non posso mangiare fragole", "Devo evitare arachidi"]) {
    assert.deepEqual(extractMealPlanHealthConstraints({ notes }), [], notes);
    assert.match(
      unsupportedMealPlanHealthNote({ notes }) || "",
      /Allergie e intolleranze non si inseriscono/i,
      notes,
    );
  }
});

test("una nota sanitaria ambigua viene rifiutata invece di essere ignorata", () => {
  assert.match(
    unsupportedMealPlanHealthNote({ notes: "L'anafilassi è un problema importante" }) || "",
    /Allergie e intolleranze non si inseriscono/i,
  );
});

test("condizioni mediche generiche non attraversano il percorso di preferenze standard", () => {
  for (const notes of [
    "Sono diabetico",
    "Sono in gravidanza",
    "Ho insufficienza renale",
    "Sono incinta",
    "Ho problemi ai reni",
    "Ho una cardiopatia",
    "Ho problemi al cuore",
  ]) {
    assert.equal(mealPlanPreferencesContainHealthData({ notes }), true, notes);
    assert.match(
      unsupportedMealPlanHealthNote({ notes }) || "",
      /non può essere verificata/i,
      notes,
    );
  }
});

test("una condizione medica non supportata resta bloccante senza estrarre allergie", () => {
  for (const notes of [
    "Sono diabetico e allergico alle arachidi",
    "Sono in gravidanza e non posso mangiare fragole",
    "Ho insufficienza renale e devo evitare le noci",
  ]) {
    assert.equal(mealPlanPreferencesContainHealthData({ notes }), true, notes);
    assert.deepEqual(extractMealPlanHealthConstraints({ notes }), [], notes);
    assert.match(
      unsupportedMealPlanHealthNote({ notes }) || "",
      /condizione medica/i,
      notes,
    );
  }
});

test("celiaco e celiaca nelle note restano bloccanti e non diventano un profilo", () => {
  for (const notes of ["Sono celiaco", "Sono celiaca"]) {
    assert.equal(mealPlanPreferencesContainHealthData({ notes }), true, notes);
    assert.deepEqual(extractMealPlanHealthConstraints({ notes }), [], notes);
    assert.match(
      unsupportedMealPlanHealthNote({ notes }) || "",
      /Allergie e intolleranze non si inseriscono/i,
      notes,
    );
  }
});