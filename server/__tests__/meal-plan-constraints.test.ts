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

test("dieta e allergie convergono nelle stesse esclusioni canoniche", () => {
  const glutenFromDiet = normalizeMealPlanConstraints({ diet: "senza glutine" });
  const glutenFromAllergies = normalizeMealPlanConstraints({ allergies: "glutine" });
  const lactoseFromDiet = normalizeMealPlanConstraints({ diet: "senza lattosio" });
  const lactoseFromAllergies = normalizeMealPlanConstraints({ allergies: "lattosio" });

  assert.deepEqual(glutenFromDiet.exclusions, ["gluten"]);
  assert.deepEqual(glutenFromAllergies.exclusions, ["gluten"]);
  assert.deepEqual(lactoseFromDiet.exclusions, ["lactose"]);
  assert.deepEqual(lactoseFromAllergies.exclusions, ["lactose"]);
  assert.equal(mealPlanHasExclusion({ diet: "gluten-free" }, "gluten"), true);
  assert.equal(mealPlanHasExclusion({ diet: "Sono celiaco" }, "gluten"), true);
  assert.equal(mealPlanHasExclusion({ diet: "intollerante al lattosio" }, "lactose"), true);
});

test("il consenso salute distingue scelta alimentare e condizione dichiarata", () => {
  assert.equal(mealPlanPreferencesContainHealthData({ diet: "senza glutine" }), false);
  assert.equal(mealPlanPreferencesContainHealthData({ diet: "senza lattosio" }), false);
  assert.equal(mealPlanPreferencesContainHealthData({ allergies: "glutine" }), true);
  assert.equal(mealPlanPreferencesContainHealthData({ allergies: "lattosio" }), true);
  assert.equal(mealPlanPreferencesContainHealthData({ diet: "Sono celiaca" }), true);
  assert.equal(mealPlanPreferencesContainHealthData({ diet: "intolleranza al lattosio" }), true);
});

test("allowlist senza glutine conserva prodotti dichiarati sicuri", () => {
  const breakfast = compatibleMealIngredients({ diet: "senza glutine" }, "breakfast");
  const main = compatibleMealIngredients({ diet: "senza glutine" }, "main");
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
      { allergies: "Glutine" },
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
    { allergies: "Glutine" },
  );
  assert.deepEqual(violations, []);
});

test("senza glutine nel campo Dieta applica la stessa validazione del campo Allergie", () => {
  const unsafe = [{ title: "Pasta comune", ingredients: [ingredient("Pasta di semola")] }];
  const safe = [{
    title: "Pasta senza glutine con ceci",
    ingredients: [ingredient("Pasta di mais senza glutine"), ingredient("Ceci")],
  }];
  for (const preferences of [{ diet: "senza glutine" }, { allergies: "glutine" }]) {
    assert.ok(validateMealPlanConstraints(unsafe, preferences).some((violation) => violation.code === "gluten"));
    assert.deepEqual(validateMealPlanConstraints(safe, preferences), []);
  }
});

test("un sostituto sicuro non rende sicuri altri ingredienti nello stesso testo", () => {
  const glutenViolations = validateMealPlanConstraints(
    [{
      title: "Pasta di riso con pane comune",
      ingredients: [ingredient("Pasta di riso con pane comune")],
    }],
    { allergies: "Glutine" },
  );
  assert.ok(glutenViolations.some((violation) => violation.code === "gluten"));

  const veganViolations = validateMealPlanConstraints(
    [{
      title: "Latte vegetale con burro",
      ingredients: [ingredient("Latte vegetale con burro")],
    }],
    { diet: "Vegana" },
  );
  assert.ok(veganViolations.some((violation) => violation.code === "milk"));
});

test("dieta vegetariana: carne e pesce vengono rifiutati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Penne al tonno",
      ingredients: [ingredient("Penne"), ingredient("Tonno")],
    }],
    { diet: "Vegetariana" },
  );
  assert.ok(violations.some((violation) => violation.code === "fish"));
});

test("dieta vegana: latte, uova e miele vengono rifiutati", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Yogurt con uova e miele",
      ingredients: [ingredient("Yogurt"), ingredient("Uova"), ingredient("Miele")],
    }],
    { diet: "Vegana" },
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
    { diet: "Vegana" },
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
    { allergies: "Lattosio" },
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
    { allergies: "Lattosio" },
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
    { allergies: "Lattosio" },
  );
  assert.ok(violations.some((violation) => violation.code === "lactose" && violation.matched === "panna"));
});

test("senza lattosio nel campo Dieta applica la stessa validazione del campo Allergie", () => {
  const unsafe = [{ title: "Pasta con ricotta", ingredients: [ingredient("Pasta"), ingredient("Ricotta")] }];
  const safe = [{ title: "Pasta con ceci", ingredients: [ingredient("Pasta"), ingredient("Ceci")] }];
  for (const preferences of [{ diet: "senza lattosio" }, { allergies: "lattosio" }]) {
    assert.ok(validateMealPlanConstraints(unsafe, preferences).some((violation) => violation.code === "lactose"));
    assert.deepEqual(validateMealPlanConstraints(safe, preferences), []);
  }
});

test("allergia al latte non accetta prodotti solo senza lattosio", () => {
  const violations = validateMealPlanConstraints(
    [{ title: "Latte senza lattosio", ingredients: [ingredient("Latte senza lattosio")] }],
    { allergies: "latte" },
  );
  assert.ok(violations.some((violation) => violation.code === "milk"));
});

test("combinazioni di pattern ed esclusioni mantengono tutti i vincoli", () => {
  const cases = [
    { diet: "mediterranea senza glutine", expectedPatterns: ["mediterranean"], expectedExclusions: ["gluten"] },
    { diet: "mediterranea senza lattosio", expectedPatterns: ["mediterranean"], expectedExclusions: ["lactose"] },
    { diet: "mediterranea senza glutine e senza lattosio", expectedPatterns: ["mediterranean"], expectedExclusions: ["gluten", "lactose"] },
    { diet: "vegetariana senza glutine", expectedPatterns: ["vegetarian"], expectedExclusions: ["gluten"] },
    { diet: "vegana senza glutine", expectedPatterns: ["vegan"], expectedExclusions: ["gluten"] },
    { diet: "vegana senza glutine", allergies: "frutta a guscio", expectedPatterns: ["vegan"], expectedExclusions: ["gluten", "nuts"] },
  ];
  for (const { expectedPatterns, expectedExclusions, ...preferences } of cases) {
    const normalized = normalizeMealPlanConstraints(preferences);
    assert.deepEqual(normalized.dietaryPatterns, expectedPatterns, JSON.stringify(preferences));
    assert.deepEqual(normalized.exclusions, expectedExclusions, JSON.stringify(preferences));
  }
});

test("allergie personalizzate: il nome inserito resta un divieto", () => {
  const violations = validateMealPlanConstraints(
    [{
      title: "Macedonia di fragole",
      ingredients: [ingredient("Fragole"), ingredient("Mela")],
    }],
    { allergies: "Fragole" },
  );
  assert.ok(violations.some((violation) => violation.code === "allergen-fragole"));
});

test("una dieta non verificabile viene bloccata invece di essere ignorata", () => {
  assert.match(
    unsupportedMealPlanDiet({ diet: "Solo cibi della mia infanzia" }) || "",
    /non può ancora essere verificato/i,
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

test("le note sanitarie estraibili diventano vincoli alimentari effettivi", () => {
  for (const notes of ["Non posso mangiare fragole", "Devo evitare arachidi"]) {
    const food = notes.includes("fragole") ? "Fragole" : "Arachidi";
    const violations = validateMealPlanConstraints(
      [{ title: `Pasto con ${food}`, ingredients: [ingredient(food)] }],
      { notes },
    );
    assert.ok(violations.length > 0, notes);
  }
});

test("una nota sanitaria ambigua viene rifiutata invece di essere ignorata", () => {
  assert.match(
    unsupportedMealPlanHealthNote({ notes: "L'anafilassi è un problema importante" }) || "",
    /non può essere verificata/i,
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

test("una condizione medica non supportata resta bloccante anche con un'allergia estraibile", () => {
  for (const notes of [
    "Sono diabetico e allergico alle arachidi",
    "Sono in gravidanza e non posso mangiare fragole",
    "Ho insufficienza renale e devo evitare le noci",
  ]) {
    assert.equal(mealPlanPreferencesContainHealthData({ notes }), true, notes);
    assert.ok(extractMealPlanHealthConstraints({ notes }).length > 0, notes);
    assert.match(
      unsupportedMealPlanHealthNote({ notes }) || "",
      /condizione medica/i,
      notes,
    );
  }
});

test("celiaco e celiaca diventano un vincolo sul glutine prima della generazione", () => {
  for (const notes of ["Sono celiaco", "Sono celiaca"]) {
    assert.equal(mealPlanPreferencesContainHealthData({ notes }), true, notes);
    assert.deepEqual(extractMealPlanHealthConstraints({ notes }), ["glutine"], notes);
    assert.equal(unsupportedMealPlanHealthNote({ notes }), undefined, notes);
    assert.ok(
      validateMealPlanConstraints(
        [{ title: "Pasta al pomodoro", ingredients: [ingredient("Pasta")] }],
        { notes },
      ).some((violation) => violation.code === "gluten"),
      notes,
    );
  }
});