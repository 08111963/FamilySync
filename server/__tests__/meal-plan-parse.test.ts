import { test } from "node:test";
import assert from "node:assert/strict";

// La chiave non serve: parseMealItems è puro, ma il modulo importa il client lazy.
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";
import { parseMealItems } from "../lib/openai";

test("parseMealItems: risposta AI non-oggetto -> []", () => {
  assert.deepEqual(parseMealItems(null), []);
  assert.deepEqual(parseMealItems("stringa"), []);
  assert.deepEqual(parseMealItems(42), []);
});

test("parseMealItems: items mancante o non-array -> []", () => {
  assert.deepEqual(parseMealItems({}), []);
  assert.deepEqual(parseMealItems({ items: "no" }), []);
  assert.deepEqual(parseMealItems({ items: { a: 1 } }), []);
});

test("parseMealItems: item malformati vengono scartati, i validi sopravvivono", () => {
  const raw = {
    items: [
      { date: "2026-07-20", mealType: "lunch", title: "Pasta al pomodoro", ingredients: [{ name: "pasta", quantity: "200", unit: "g" }], steps: ["cuoci", "condisci"] },
      { date: "2026-07-20", mealType: "brunch", title: "MealType invalido" },
      { mealType: "dinner", title: "Senza data" },
      { date: "2026-07-21", mealType: "dinner" },
      "non-un-oggetto",
      null,
    ],
  };
  const out = parseMealItems(raw);
  // mealType fuori enum, non-oggetti e null vengono scartati dal parser.
  assert.ok(out.every((i) => ["breakfast", "lunch", "dinner", "snack"].includes(i.mealType)));
  assert.ok(out.some((i) => i.title === "Pasta al pomodoro"));
  // I campi mancanti coerce-ano a stringhe non-date ("undefined"): è il filtro
  // validDates della rotta a eliminarli. Simuliamo quel filtro qui.
  const validDates = new Set(["2026-07-20", "2026-07-21"]);
  const filtered = out.filter((i) => validDates.has(i.date));
  assert.ok(filtered.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date)));
  const good = filtered.find((i) => i.title === "Pasta al pomodoro");
  assert.ok(good);
  assert.equal(good!.steps?.length, 2);
});

test("parseMealItems: ingredients/steps corrotti degradano a [] senza scartare l'item", () => {
  const out = parseMealItems({
    items: [{ date: "2026-07-20", mealType: "dinner", title: "Zuppa", ingredients: "no", steps: { a: 1 } }],
  });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0]!.ingredients, []);
  assert.deepEqual(out[0]!.steps, []);
});
