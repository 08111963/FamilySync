import test from "node:test";
import assert from "node:assert/strict";
import {
  mealPlanPreferencesContainHealthData,
  unsupportedMealPlanHealthNote,
  unsupportedMealPlanDiet,
  validateMealPlanConstraints,
} from "../lib/meal-plan-constraints";

const ingredient = (name: string) => ({ name });

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