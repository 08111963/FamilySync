import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";
import { generateWeeklyMealPlan, __setOpenAiClientForTest } from "../lib/openai";
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";

const WEEK_START = "2026-08-03";
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + i);
  return d.toISOString().split("T")[0]!;
});

type Ingredient = { name: string; quantity: string; unit: string };
type Meal = {
  date: string;
  mealType: string;
  title: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
};
type RequestInfo = {
  dates: string[];
  mealTypes: string[];
  ingredientNames?: string[];
  sysPrompt: string;
  compact: boolean;
  stepMinItems: number | undefined;
  stepMaxItems: number | undefined;
  maxCompletionTokens: number | undefined;
};

function makeMeal(date: string, mealType: string, title: string, ingredients: Ingredient[]): Meal {
  return { date, mealType, title, description: "Preparazione semplice.", ingredients, steps: ["Prepara gli ingredienti.", "Servi."] };
}

function requestedDates(sysPrompt: string): string[] {
  const match = sysPrompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./);
  assert.ok(match, "il prompt deve indicare tutti i giorni richiesti");
  return match![1]!.split(",").map((value) => value.trim()).filter(Boolean);
}

function createFakeClient(buildItems: (request: RequestInfo) => Meal[]) {
  const calls: RequestInfo[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: any) => {
          const sysPrompt = request.messages.find((message: any) => message.role === "system")!.content;
          const schema = request.response_format.json_schema.schema;
          const itemSchema = schema.properties.items.items;
          const info: RequestInfo = {
            dates: requestedDates(sysPrompt),
            mealTypes: itemSchema.properties.mealType.enum,
            ingredientNames: itemSchema.properties.ingredients.items.properties.name.enum,
            sysPrompt,
            compact: request.response_format.json_schema.name === "compact_weekly_meal_plan_response",
            stepMinItems: itemSchema.properties.steps?.minItems,
            stepMaxItems: itemSchema.properties.steps?.maxItems,
            maxCompletionTokens: request.max_completion_tokens,
          };
          calls.push(info);
          return {
            choices: [{ message: { content: JSON.stringify({ items: buildItems(info) }) }, finish_reason: "stop" }],
          };
        },
      },
    },
  };
  return { client, calls };
}

function weekItems(request: RequestInfo): Meal[] {
  const breakfastFruits = ["banana", "mela", "pera", "arancia", "kiwi", "mirtilli", "pesca"];
  return request.dates.flatMap((date, index) =>
    request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        return makeMeal(date, mealType, `Colazione ${index}`, [
          { name: breakfastFruits[index]!, quantity: "1", unit: "pezzo" },
          { name: "yogurt bianco", quantity: "125", unit: "g" },
        ]);
      }
      if (mealType === "lunch") {
        return makeMeal(date, mealType, `Pranzo ${index}`, [
          { name: "pasta", quantity: "80", unit: "g" },
          { name: "ceci", quantity: "100", unit: "g" },
          { name: "zucchine", quantity: "150", unit: "g" },
        ]);
      }
      return makeMeal(date, mealType, `Cena ${index}`, [
        { name: "pollo", quantity: "120", unit: "g" },
        { name: "patate", quantity: "180", unit: "g" },
        { name: "spinaci", quantity: "150", unit: "g" },
      ]);
    }),
  );
}

function assertCompleteWeek(items: Array<{ date: string; mealType: string }>, mealsPerDay: number) {
  assert.equal(items.length, 7 * mealsPerDay);
  for (const date of DATES) {
    assert.equal(items.filter((item) => item.date === date).length, mealsPerDay, `pasti completi per ${date}`);
  }
}

test("senza vincoli: una richiesta compatta genera l'intera settimana", async (t) => {
  const { client, calls } = createFakeClient(weekItems);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const progress: Meal[][] = [];
  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    onProgress: (items) => progress.push(items as Meal[]),
  });

  assert.equal(calls.length, 1, "il percorso standard usa al massimo una richiesta AI");
  assert.deepEqual(calls[0]!.dates, DATES);
  assert.deepEqual(calls[0]!.mealTypes, ["breakfast", "lunch", "dinner"]);
  assert.equal(calls[0]!.compact, true, "il contratto standard resta compatto anche con micro-passaggi");
  assert.equal(calls[0]!.stepMinItems, 2, "il contratto compatto richiede due passaggi");
  assert.equal(calls[0]!.stepMaxItems, 2, "il contratto compatto limita i passaggi per restare rapido");
  assert.equal(calls[0]!.maxCompletionTokens, 3000, "il percorso standard usa un budget di output ridotto");
  assert.match(calls[0]!.sysPrompt, /Mantieni la risposta compatta/i);
  assertCompleteWeek(plan.items, 3);
  assert.ok(
    plan.items.every((item) => (item.steps?.length || 0) >= 2),
    "il piano compatto mantiene passaggi visibili per ogni ricetta",
  );
  assert.equal(progress.length, 7, "l'interfaccia riceve comunque gli aggiornamenti per giorno");
});

test("due pasti al giorno mantengono il contratto da 14 pasti completi", async (t) => {
  const { client, calls } = createFakeClient(weekItems);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  assert.equal(calls.length, 1, "anche con due pasti il percorso standard resta una sola richiesta");
  assert.deepEqual(calls[0]!.mealTypes, ["lunch", "dinner"]);
  assert.equal(calls[0]!.compact, true);
  assertCompleteWeek(plan.items, 2);
});

test("con glutine: tre richieste mirate mantengono colazioni dolci e pasti completi", async (t) => {
  const { client, calls } = createFakeClient((request) => request.dates.flatMap((date, index) =>
    request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        return makeMeal(date, mealType, "Titolo ignorato", [
          { name: "banana", quantity: "1", unit: "pezzo" },
          { name: "yogurt bianco", quantity: "125", unit: "g" },
        ]);
      }
      return makeMeal(date, mealType, "Titolo ignorato", mealType === "lunch"
        ? [
            { name: "riso", quantity: "80", unit: "g" },
            { name: "ceci", quantity: "100", unit: "g" },
            { name: "zucchine", quantity: "150", unit: "g" },
          ]
        : [
            { name: "pollo", quantity: "120", unit: "g" },
            { name: "patate", quantity: "180", unit: "g" },
            { name: "spinaci", quantity: "150", unit: "g" },
          ]);
    }),
  ));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Glutine" },
  });

  assert.equal(calls.length, 3, "colazioni, pranzi e cene viaggiano in parallelo");
  const breakfastCall = calls.find((call) => call.mealTypes.length === 1 && call.mealTypes[0] === "breakfast")!;
  assert.ok(breakfastCall.ingredientNames);
  for (const invalidBreakfastIngredient of ["riso", "polenta di mais", "zucchine", "melanzane", "pomodori", "ceci"]) {
    assert.ok(!breakfastCall.ingredientNames!.includes(invalidBreakfastIngredient), invalidBreakfastIngredient);
  }
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Glutine" }), []);
  assert.ok(plan.items.filter((item) => item.mealType === "breakfast").every((item) => !/\b(?:riso|polenta|zucchine|melanzane|pomodori|ceci)\b/i.test(item.title)));
  assert.ok(plan.items.some((item) => item.mealType === "breakfast" && /yogurt.*banana/i.test(item.title)));
});

test("con lattosio: la lista sicura esclude latticini ma consente la pasta", async (t) => {
  const { client, calls } = createFakeClient((request) => request.dates.flatMap((date, index) =>
    request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        return makeMeal(date, mealType, `Colazione ${index}`, [
          { name: "banana", quantity: "1", unit: "pezzo" },
          { name: "bevanda di riso", quantity: "200", unit: "ml" },
        ]);
      }
      return makeMeal(date, mealType, `${mealType} ${index}`, mealType === "lunch"
        ? [
            { name: "pasta", quantity: "80", unit: "g" },
            { name: "ceci", quantity: "100", unit: "g" },
            { name: "pomodori", quantity: "120", unit: "g" },
          ]
        : [
            { name: "pollo", quantity: "120", unit: "g" },
            { name: "patate", quantity: "180", unit: "g" },
            { name: "spinaci", quantity: "150", unit: "g" },
          ]);
    }),
  ));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  const mainCall = calls.find((call) => call.mealTypes.includes("lunch"))!;
  assert.ok(mainCall.ingredientNames?.includes("pasta"), "lattosio non deve vietare il glutine");
  assert.ok(!mainCall.ingredientNames?.includes("latte"));
  assert.ok(!mainCall.ingredientNames?.includes("pane senza glutine"));
  assert.match(mainCall.sysPrompt, /NON richiede di evitare il glutine/i);
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
  assert.ok(plan.items.some((item) => item.ingredients?.some((ingredient) => ingredient.name === "pasta")));
});

test("gli elenchi strutturati rispettano anche allergeni diversi", async (t) => {
  for (const allergy of ["Uova", "Pesce", "Arachidi", "Frutta a guscio", "Soia", "Fragole"]) {
    const { client, calls } = createFakeClient((request) => request.dates.flatMap((date, index) =>
      request.mealTypes.map((mealType) => {
        const names = request.ingredientNames || ["mela"];
        return makeMeal(date, mealType, `${mealType} ${index}`, [{ name: names[0]!, quantity: "1", unit: "pezzo" }]);
      }),
    ));
    __setOpenAiClientForTest(client);
    try {
      await generateWeeklyMealPlan({
        familySize: 4,
        weekStartDate: WEEK_START,
        preferences: { allergies: allergy },
      });
      for (const call of calls) {
        for (const name of call.ingredientNames || []) {
          assert.deepEqual(
            validateMealPlanConstraints([{ title: name, ingredients: [{ name }] }], { allergies: allergy }),
            [],
            `${allergy}: ${name}`,
          );
        }
      }
    } finally {
      __setOpenAiClientForTest(null);
    }
  }
  t.diagnostic("Ogni allergene usa lo stesso validatore anche per l'enum degli ingredienti.");
});

test("una risposta incompleta non viene consegnata come settimana valida", async (t) => {
  const { client } = createFakeClient((request) => request.dates.slice(0, 6).flatMap((date) =>
    request.mealTypes.map((mealType) => makeMeal(date, mealType, "Pasto", [{ name: "mela", quantity: "1", unit: "pezzo" }])),
  ));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START }),
    (error: unknown) => (error as { code?: string }).code === "AI_BAD_RESPONSE",
  );
});

test("un piano standard senza varietà viene rifiutato invece di essere consegnato", async (t) => {
  const { client, calls } = createFakeClient((request) => request.dates.flatMap((date) =>
    request.mealTypes.map((mealType) => makeMeal(date, mealType, "Pasto ripetuto", [
      { name: "mela", quantity: "1", unit: "pezzo" },
    ])),
  ));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START }),
    (error: unknown) => (error as { code?: string }).code === "AI_BAD_RESPONSE",
  );
  assert.equal(calls.length, 2, "una sola rigenerazione è consentita prima dell'errore");
  assert.ok(calls.every((call) => call.compact), "anche il retry standard resta compatto");
});

test("una risposta incompleta viene rigenerata una sola volta senza inviare piani parziali", async (t) => {
  let callsBeforeCompleteRetry = 0;
  const { client, calls } = createFakeClient((request) => {
    callsBeforeCompleteRetry++;
    if (callsBeforeCompleteRetry <= 3) {
      return request.dates.slice(0, 6).map((date) =>
        makeMeal(date, request.mealTypes[0]!, "Pasto incompleto", [{ name: "mela", quantity: "1", unit: "pezzo" }]));
    }
    return request.dates.map((date, index) => {
      const mealType = request.mealTypes[0]!;
      if (mealType === "breakfast") {
        return makeMeal(date, mealType, `Colazione ${index}`, [
          { name: "banana", quantity: "1", unit: "pezzo" },
          { name: "bevanda di riso", quantity: "200", unit: "ml" },
        ]);
      }
      if (mealType === "lunch") {
        return makeMeal(date, mealType, `Pranzo ${index}`, [
          { name: "pasta", quantity: "80", unit: "g" },
          { name: "ceci", quantity: "100", unit: "g" },
          { name: "pomodori", quantity: "120", unit: "g" },
        ]);
      }
      return makeMeal(date, mealType, `Cena ${index}`, [
        { name: "pollo", quantity: "120", unit: "g" },
        { name: "patate", quantity: "180", unit: "g" },
        { name: "spinaci", quantity: "150", unit: "g" },
      ]);
    });
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const progress: Meal[][] = [];
  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
    onProgress: (items) => progress.push(items as Meal[]),
  });

  assert.equal(calls.length, 6, "tre richieste iniziali e una sola rigenerazione completa");
  assertCompleteWeek(plan.items, 3);
  assert.equal(progress.length, 7, "nessun giorno parziale raggiunge il client");
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
});

test("un alimento da pranzo nel testo della colazione fa fallire il piano standard", async (t) => {
  const { client, calls } = createFakeClient((request) => {
    return weekItems(request).map((item) => item.mealType === "breakfast"
      ? makeMeal(item.date, "breakfast", "Patate al forno", [
          { name: "banana", quantity: "1", unit: "pezzo" },
        ])
      : item);
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START }),
    (error: unknown) => (error as { code?: string }).code === "AI_BAD_RESPONSE",
  );
  assert.equal(calls.length, 2, "un solo retry è consentito per una colazione non valida");
});