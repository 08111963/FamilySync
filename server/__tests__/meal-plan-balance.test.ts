import { test } from "node:test";
import assert from "node:assert/strict";

// La chiave non serve per davvero: iniettiamo un client fittizio, ma
// assertAiConfigured richiede che una chiave sia presente nell'ambiente.
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import { generateWeeklyMealPlan, __setOpenAiClientForTest } from "../lib/openai";
import {
  analyzeMediterraneanBalance,
  hasPastaOrRice,
  hasLegumes,
  hasFish,
  hasVegetables,
  type MealPlanItem,
} from "../lib/meal-plan-balance";

const WEEK_START = "2026-08-03"; // lunedì
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + i);
  return d.toISOString().split("T")[0]!;
});

function meal(
  date: string,
  mealType: string,
  title: string,
  ingredients: string[] = []
): MealPlanItem {
  return {
    date,
    mealType: mealType as MealPlanItem["mealType"],
    title,
    description: "",
    ingredients: ingredients.map((name) => ({ name, quantity: "1", unit: "pz" })),
    steps: ["fai"],
  };
}

test("classificatori: pasta/riso, legumi, pesce, verdure (titolo e ingredienti)", () => {
  assert.ok(hasPastaOrRice(meal(DATES[0]!, "lunch", "Spaghetti al pomodoro")));
  assert.ok(hasPastaOrRice(meal(DATES[0]!, "lunch", "Risotto agli asparagi")));
  assert.ok(hasPastaOrRice(meal(DATES[0]!, "lunch", "Piatto unico", ["farro", "zucchine"])), "riconosce dagli ingredienti");
  assert.ok(!hasPastaOrRice(meal(DATES[0]!, "lunch", "Pollo arrosto con patate")));

  assert.ok(hasLegumes(meal(DATES[0]!, "dinner", "Zuppa di lenticchie")));
  assert.ok(hasLegumes(meal(DATES[0]!, "dinner", "Insalata", ["ceci", "pomodori"])));
  assert.ok(!hasLegumes(meal(DATES[0]!, "dinner", "Frittata di zucchine")));

  assert.ok(hasFish(meal(DATES[0]!, "dinner", "Branzino al forno")));
  assert.ok(hasFish(meal(DATES[0]!, "lunch", "Pasta", ["tonno", "olive"])));
  assert.ok(!hasFish(meal(DATES[0]!, "dinner", "Scaloppine al limone")));

  assert.ok(hasVegetables(meal(DATES[0]!, "lunch", "Pasta con le zucchine")));
  assert.ok(hasVegetables(meal(DATES[0]!, "dinner", "Pollo con contorno di verdure")));
  assert.ok(hasVegetables(meal(DATES[0]!, "dinner", "Orata", ["broccoli"])));
  assert.ok(!hasVegetables(meal(DATES[0]!, "dinner", "Uova sode con pane")));
});

/** Piano settimanale mediterraneo "da manuale": bilanciato. */
function balancedWeek(): MealPlanItem[] {
  const lunches = [
    meal(DATES[0]!, "lunch", "Spaghetti al pomodoro e basilico", ["pomodori"]),
    meal(DATES[1]!, "lunch", "Risotto alle zucchine"),
    meal(DATES[2]!, "lunch", "Pasta con le sarde", ["sarde", "finocchietto"]),
    meal(DATES[3]!, "lunch", "Orecchiette alle cime di rapa"),
    meal(DATES[4]!, "lunch", "Pasta e ceci con rosmarino", ["ceci", "sedano"]),
    meal(DATES[5]!, "lunch", "Farro con verdure grigliate"),
    meal(DATES[6]!, "lunch", "Lasagne di verdure"),
  ];
  const dinners = [
    meal(DATES[0]!, "dinner", "Frittata con insalata mista"),
    meal(DATES[1]!, "dinner", "Branzino al forno con carote"),
    meal(DATES[2]!, "dinner", "Pollo ai peperoni"),
    meal(DATES[3]!, "dinner", "Zuppa di lenticchie e bietole", ["lenticchie", "bietole"]),
    meal(DATES[4]!, "dinner", "Merluzzo con fagiolini", ["merluzzo", "fagiolini"]),
    meal(DATES[5]!, "dinner", "Caprese con verdure grigliate"),
    meal(DATES[6]!, "dinner", "Tacchino con spinaci"),
  ];
  return [...lunches, ...dinners];
}

test("piano bilanciato: nessuno squilibrio segnalato", () => {
  const report = analyzeMediterraneanBalance(balancedWeek());
  assert.equal(report.daysAnalyzed, 7);
  assert.equal(report.lunchCount, 7);
  assert.equal(report.dinnerCount, 7);
  assert.ok(report.pastaRiceLunches >= 5, `pasta/riso a pranzo: ${report.pastaRiceLunches}`);
  assert.equal(report.missingVegetableSlots.length, 0);
  assert.ok(report.legumeMeals <= 3);
  assert.ok(report.fishMeals >= 2);
  assert.deepEqual(report.issues, []);
  assert.equal(report.balanced, true);
});

test("piano squilibrato (il caso segnalato dall'utente): troppi legumi, poca pasta, niente verdure, niente pesce", () => {
  // Il difetto originale: legumi quasi tutti i giorni, pochissima pasta,
  // verdure quasi assenti, pesce assente.
  const items: MealPlanItem[] = [
    meal(DATES[0]!, "lunch", "Zuppa di lenticchie"),
    meal(DATES[1]!, "lunch", "Ceci in umido"),
    meal(DATES[2]!, "lunch", "Fagioli all'uccelletto"),
    meal(DATES[3]!, "lunch", "Pasta e fagioli"),
    meal(DATES[4]!, "lunch", "Lenticchie con riso"),
    meal(DATES[5]!, "lunch", "Burger di ceci"),
    meal(DATES[6]!, "lunch", "Vellutata di piselli"),
    meal(DATES[0]!, "dinner", "Frittata di patate"),
    meal(DATES[1]!, "dinner", "Uova sode"),
    meal(DATES[2]!, "dinner", "Formaggi misti con pane"),
    meal(DATES[3]!, "dinner", "Pollo arrosto"),
    meal(DATES[4]!, "dinner", "Tacchino al limone"),
    meal(DATES[5]!, "dinner", "Hamburger di manzo"),
    meal(DATES[6]!, "dinner", "Frittata di cipolle"),
  ];
  const report = analyzeMediterraneanBalance(items);
  assert.equal(report.balanced, false);
  assert.ok(report.legumeMeals > 3, `legumi: ${report.legumeMeals}`);
  assert.ok(report.pastaRiceLunches < 5, `pasta a pranzo: ${report.pastaRiceLunches}`);
  assert.ok(report.fishMeals < 2);
  assert.ok(report.missingVegetableSlots.length > 0);
  // Un issue per ogni categoria di squilibrio.
  assert.ok(report.issues.some((i) => i.includes("pasta")), "segnala poca pasta");
  assert.ok(report.issues.some((i) => i.includes("Verdure mancanti")), "segnala verdure mancanti");
  assert.ok(report.issues.some((i) => i.includes("Troppi legumi")), "segnala troppi legumi");
  assert.ok(report.issues.some((i) => i.includes("poco pesce")), "segnala poco pesce");
});

test("piano parziale (3 giorni): soglie scalate, non falsi allarmi su pesce/legumi", () => {
  const items: MealPlanItem[] = [
    meal(DATES[0]!, "lunch", "Pasta al pomodoro", ["pomodori"]),
    meal(DATES[1]!, "lunch", "Risotto alle verdure"),
    meal(DATES[2]!, "lunch", "Spaghetti alle vongole", ["vongole", "pomodorini", "prezzemolo"]),
    meal(DATES[0]!, "dinner", "Orata con insalata"),
    meal(DATES[1]!, "dinner", "Zuppa di ceci e bietole", ["ceci", "bietole"]),
    meal(DATES[2]!, "dinner", "Pollo con zucchine"),
  ];
  const report = analyzeMediterraneanBalance(items);
  assert.equal(report.daysAnalyzed, 3);
  assert.deepEqual(report.issues, []);
  assert.equal(report.balanced, true);
});

test("colazioni e spuntini sono ignorati dall'analisi", () => {
  const items = [
    ...balancedWeek(),
    meal(DATES[0]!, "breakfast", "Latte e biscotti"),
    meal(DATES[0]!, "snack", "Frutta secca"),
  ];
  const report = analyzeMediterraneanBalance(items);
  assert.equal(report.lunchCount, 7);
  assert.equal(report.dinnerCount, 7);
  assert.equal(report.balanced, true);
});

test("con dieta mediterranea il prompt contiene la regola di distribuzione e il piano simulato risulta bilanciato", async (t) => {
  // Client simulato: verifica che generateWeeklyMealPlan inoltri la
  // mediterraneanRule nel system prompt e che un piano conforme alla regola
  // passi l'analisi end-to-end (generazione -> conteggio).
  const week = balancedWeek();
  const sysPrompts: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (req: any) => {
          const sysPrompt = req.messages.find((message: { role: string; content: string }) => message.role === "system")!.content;
          sysPrompts.push(sysPrompt);
          const m = sysPrompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./);
          const dates = m![1]!.split(",").map((date: string) => date.trim());
          const mealTypes: string[] = req.response_format.json_schema.schema.properties.items.items.properties.mealType.enum;
          const items = week
            .filter((item) => dates.includes(item.date) && mealTypes.includes(item.mealType))
            .map((item) => ({
              ...item,
              description: item.description || "Pasto completo e semplice.",
              ingredients: item.ingredients?.length
                ? item.ingredients
                : [{ name: "pomodori", quantity: "1", unit: "pz" }],
            }));
          return { choices: [{ message: { content: JSON.stringify({ items }) }, finish_reason: "stop" }] };
        },
      },
    },
  };
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { diet: "Mediterranea", mealsPerDay: 2 },
  });

  assert.ok(
    sysPrompts.every((p) => p.includes("DIETA MEDITERRANEA CON VINCOLI")),
    "ogni chiamata deve contenere la regola mediterranea"
  );
  assert.ok(
    sysPrompts.every((p) => p.includes("verdure fresche o un contorno di verdure in OGNI pranzo e cena")),
    "regola verdure sempre presente"
  );

  const report = analyzeMediterraneanBalance(plan.items);
  assert.equal(report.daysAnalyzed, 7);
  assert.equal(report.balanced, true, `squilibri: ${report.issues.join(" | ")}`);
});

test("senza dieta mediterranea la regola dedicata NON viene aggiunta al prompt", async (t) => {
  const sysPrompts: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (req: any) => {
          const sysPrompt = req.messages.find((message: { role: string; content: string }) => message.role === "system")!.content;
          sysPrompts.push(sysPrompt);
          const m = sysPrompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./);
          const dates = m![1]!.split(",").map((date: string) => date.trim());
          const mealTypes: string[] = req.response_format.json_schema.schema.properties.items.items.properties.mealType.enum;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  items: dates.flatMap((date: string) => mealTypes.map((mealType: string) => ({
                    ...meal(date, mealType, `${mealType} vegetariano ${date}`),
                    description: "Pasto completo e semplice.",
                    ingredients: [{ name: "Lenticchie", quantity: "150", unit: "g" }],
                  }))),
                }),
              },
              finish_reason: "stop",
            }],
          };
        },
      },
    },
  };
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { diet: "Vegetariana", mealsPerDay: 2 },
  });

  assert.ok(sysPrompts.length > 0);
  assert.ok(sysPrompts.every((p) => !p.includes("DIETA MEDITERRANEA VERA")));
});
