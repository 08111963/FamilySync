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
const THREE_MEAL_WEEK_REQUESTS = 14;

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
  titleMinLength: number | undefined;
  descriptionMinLength: number | undefined;
  ingredientTextMinLength: number | undefined;
  stepTextMinLength: number | undefined;
  stepMinItems: number | undefined;
  stepMaxItems: number | undefined;
  maxCompletionTokens: number | undefined;
};

function makeMeal(date: string, mealType: string, title: string, ingredients: Ingredient[]): Meal {
  return {
    date,
    mealType,
    title,
    description: "Preparazione semplice.",
    ingredients,
    steps: [
      "Lava e prepara gli ingredienti indicati.",
      "Cuoci gli ingredienti seguendo le dosi previste.",
      "Assembla il piatto e servilo caldo.",
    ],
  };
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
            titleMinLength: itemSchema.properties.title?.minLength,
            descriptionMinLength: itemSchema.properties.description?.minLength,
            ingredientTextMinLength: itemSchema.properties.ingredients.items.properties.quantity?.minLength,
            stepTextMinLength: itemSchema.properties.steps.items?.minLength,
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
  return request.dates.flatMap((date) => {
    const index = DATES.indexOf(date);
    return request.mealTypes.map((mealType) => {
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
    });
  });
}

function lactoseSafeWeekItems(request: RequestInfo): Meal[] {
  const breakfastFruits = ["banana", "mela", "pera", "arancia", "kiwi", "mirtilli", "pesca"];
  return request.dates.flatMap((date) => {
    const index = DATES.indexOf(date);
    return request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        return makeMeal(date, mealType, `Colazione ${index}`, [
          { name: breakfastFruits[index]!, quantity: "1", unit: "pezzo" },
          { name: "bevanda di riso", quantity: "200", unit: "ml" },
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
    });
  });
}

function assertCompleteWeek(items: Array<{ date: string; mealType: string }>, mealsPerDay: number) {
  assert.equal(items.length, 7 * mealsPerDay);
  for (const date of DATES) {
    assert.equal(items.filter((item) => item.date === date).length, mealsPerDay, `pasti completi per ${date}`);
  }
}

test("senza vincoli: richieste giornaliere piccole mantengono ricette leggibili", async (t) => {
  const { client, calls } = createFakeClient(weekItems);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const progress: Meal[][] = [];
  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    onProgress: (items) => progress.push(items as Meal[]),
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS, "una colazione e un blocco pranzo/cena per ogni giorno");
  assert.equal(calls.filter((call) => call.mealTypes[0] === "breakfast").length, 7);
  assert.equal(calls.filter((call) => call.mealTypes.includes("lunch")).length, 7);
  assert.ok(calls.every((call) => call.dates.length === 1));
  assert.ok(calls.every((call) =>
    call.mealTypes[0] === "breakfast"
      ? call.mealTypes.length === 1
      : JSON.stringify(call.mealTypes) === JSON.stringify(["lunch", "dinner"])));
  assert.ok(calls.every((call) => !call.compact));
  assert.ok(calls.every((call) => call.maxCompletionTokens === 4000));
  assert.ok(calls.every((call) => call.stepMinItems === 3));
  assert.ok(calls.every((call) => call.stepMaxItems === 6));
  assert.ok(calls.every((call) => /da 3 a 6 istruzioni concrete e chiare/i.test(call.sysPrompt)));
  assertCompleteWeek(plan.items, 3);
  assert.ok(plan.items.every((item) => (item.steps?.length || 0) >= 3));
  assert.ok(plan.items.every((item) => (item.steps?.length || 0) <= 6));
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

  assert.equal(calls.length, 7, "un blocco pranzo/cena per ogni giorno");
  assert.ok(calls.every((call) => JSON.stringify(call.mealTypes) === JSON.stringify(["lunch", "dinner"])));
  assert.ok(calls.every((call) => !call.compact));
  assertCompleteWeek(plan.items, 2);
});

test("campi vuoti in una ricetta vengono bloccati dallo schema e rigenerati", async (t) => {
  let malformedResponse = true;
  const { client, calls } = createFakeClient((request) => {
    const items = weekItems(request);
    if (malformedResponse) {
      malformedResponse = false;
      items[0]!.ingredients[0]!.quantity = "";
    }
    return items;
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2, "una risposta con quantità vuota non deve essere consegnata");
  assert.ok(calls.every((call) =>
    call.titleMinLength === 1 &&
    call.descriptionMinLength === 1 &&
    call.ingredientTextMinLength === 1 &&
    call.stepTextMinLength === 1,
  ), "lo schema strutturato deve vietare tutti i testi vuoti");
  assertCompleteWeek(plan.items, 3);
});

test("con glutine: richieste giornaliere mirate mantengono colazioni dolci e pasti completi", async (t) => {
  const { client, calls } = createFakeClient((request) => request.dates.flatMap((date) => {
    const index = DATES.indexOf(date);
    return request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        const fruit = ["banana", "mela", "pera", "arancia", "kiwi", "mirtilli", "pesca"][index]!;
        return makeMeal(date, mealType, `Colazione con yogurt e ${fruit}`, [
          { name: fruit, quantity: "1", unit: "pezzo" },
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
    });
  }));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Glutine" },
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS);
  const breakfastCall = calls.find((call) => call.mealTypes.length === 1 && call.mealTypes[0] === "breakfast")!;
  assert.ok(breakfastCall.ingredientNames);
  for (const invalidBreakfastIngredient of ["riso", "polenta di mais", "zucchine", "melanzane", "pomodori", "ceci"]) {
    assert.ok(!breakfastCall.ingredientNames!.includes(invalidBreakfastIngredient), invalidBreakfastIngredient);
  }
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Glutine" }), []);
  assert.ok(plan.items.filter((item) => item.mealType === "breakfast").every((item) => !/\b(?:riso|polenta|zucchine|melanzane|pomodori|ceci)\b/i.test(item.title)));
  assert.ok(plan.items.some((item) => item.mealType === "breakfast" && item.title.startsWith("Colazione con yogurt e banana")));
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
  assert.match(mainCall.sysPrompt, /Non etichettare i piatti come "senza lattosio"/i);
  assert.doesNotMatch(mainCall.sysPrompt, /Se usi un sostituto compatibile/i);
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
  assert.ok(plan.items.some((item) => item.ingredients?.some((ingredient) => ingredient.name === "pasta")));
});

test("con vincoli: i prompt mantengono prodotti classici e rotazioni concrete per colazione e cena", async (t) => {
  const { client, calls } = createFakeClient(lactoseSafeWeekItems);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  assert.ok(
    calls.every((call) => /NON proporre varianti "integrali"/i.test(call.sysPrompt)),
    "un vincolo come il lattosio non deve trasformare pasta, riso o pane in integrali",
  );
  const breakfastPrompts = calls
    .filter((call) => call.mealTypes.length === 1 && call.mealTypes[0] === "breakfast")
    .map((call) => call.sysPrompt.match(/Per la colazione di questo giorno realizza questa combinazione concreta e non sostituirla con una colazione generica: ([^.]+)\./)?.[1]);
  assert.equal(breakfastPrompts.length, 7);
  assert.equal(new Set(breakfastPrompts).size, 7, "ogni giorno deve ricevere una colazione concreta diversa");
  assert.ok(breakfastPrompts.every((prompt) => prompt && !/^una colazione/i.test(prompt)));

  const dinnerPrompts = calls
    .filter((call) => call.mealTypes.includes("dinner"))
    .map((call) => call.sysPrompt.match(/(A CENA[^.]+\.)/)?.[1]);
  assert.equal(dinnerPrompts.length, 7);
  assert.equal(new Set(dinnerPrompts).size, 7, "ogni giorno deve ricevere una cena con rotazione dedicata");
});

test("prodotti integrali non richiesti vengono rigenerati prima della consegna", async (t) => {
  let responseNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const firstAttempt = responseNumber++ < THREE_MEAL_WEEK_REQUESTS;
    return weekItems(request).map((item) => firstAttempt && item.mealType === "lunch"
      ? makeMeal(item.date, item.mealType, "Pasta integrale con ceci e zucchine", [
          { name: "pasta integrale", quantity: "80", unit: "g" },
          { name: "ceci", quantity: "100", unit: "g" },
          { name: "zucchine", quantity: "150", unit: "g" },
        ])
      : item);
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2);
  assert.ok(calls.slice(THREE_MEAL_WEEK_REQUESTS).every((call) =>
    /Non usare mai le parole "integrale"/i.test(call.sysPrompt)));
  assert.ok(plan.items.every((item) => !/\bintegral(?:e|i)?\b/i.test([
    item.title,
    item.description,
    ...(item.ingredients || []).map((ingredient) => ingredient.name),
    ...(item.steps || []),
  ].join(" "))));
});

test("con lattosio: i passaggi dettagliati usano il contesto dell'ingrediente vegetale sicuro", async (t) => {
  const { client } = createFakeClient((request) => request.dates.flatMap((date) => {
    const index = DATES.indexOf(date);
    return request.mealTypes.map((mealType) => {
      if (mealType === "breakfast") {
        const meal = makeMeal(date, mealType, `Porridge ${index}`, [
          { name: "bevanda di riso", quantity: "200", unit: "ml" },
          { name: "banana", quantity: "1", unit: "pezzo" },
        ]);
        meal.steps = [
          "Scalda la bevanda di riso in un pentolino.",
          "Versa il latte caldo sulla banana a rondelle.",
          "Mescola e servi la colazione.",
        ];
        return meal;
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
    });
  }));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
});

test("con lattosio: un riferimento libero a un latticino rigenera il piano naturalmente privo di latticini", async (t) => {
  let responseNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const firstAttempt = responseNumber++ < THREE_MEAL_WEEK_REQUESTS;
    const items = lactoseSafeWeekItems(request);
    if (firstAttempt) {
      for (const item of items.filter((item) => item.mealType === "breakfast")) {
        item.steps[1] = "Aggiungi la ricotta e mescola prima di servire.";
      }
    }
    return items;
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2);
  assert.ok(calls.every((call) => /PIANO NATURALMENTE PRIVO DI LATTICINI/i.test(call.sysPrompt)));
  assert.ok(calls.slice(THREE_MEAL_WEEK_REQUESTS).every((call) =>
    /VINCOLO LATTOSIO: ricrea il piano con ingredienti naturalmente privi di latticini/i.test(call.sysPrompt)));
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
});

test("con lattosio: formato, allergene e varietà usano retry indipendenti e cumulativi", async (t) => {
  let responseNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const attempt = Math.floor(responseNumber++ / THREE_MEAL_WEEK_REQUESTS);
    const items = lactoseSafeWeekItems(request);

    if (attempt === 0) {
      return items.map((item) => item.mealType === "breakfast"
        ? makeMeal(item.date, item.mealType, "Riso a colazione", [
            { name: "riso", quantity: "80", unit: "g" },
          ])
        : item);
    }
    if (attempt === 1) {
      return items.map((item) => ({ ...item, steps: item.steps.slice(0, 2) }));
    }
    if (attempt === 2) {
      return items.map((item) => item.mealType === "dinner"
        ? { ...item, steps: [
            "Lava e taglia gli ingredienti.",
            "Sciogli il burro in padella e unisci gli ingredienti.",
            "Cuoci e servi il piatto.",
          ] }
        : item);
    }
    if (attempt === 3) {
      return items.map((item) => ({
        ...item,
        title: item.mealType === "breakfast"
          ? "Colazione ripetuta"
          : item.mealType === "lunch"
            ? "Pranzo ripetuto"
            : "Cena ripetuta",
      }));
    }
    return items;
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 5);
  const finalAttemptPrompts = calls.slice(THREE_MEAL_WEEK_REQUESTS * 4);
  assert.ok(finalAttemptPrompts.every((call) => /colazione dolce/i.test(call.sysPrompt)));
  assert.ok(finalAttemptPrompts.every((call) => /almeno un ingrediente/i.test(call.sysPrompt)));
  assert.ok(finalAttemptPrompts.every((call) => /VINCOLO LATTOSIO/i.test(call.sysPrompt)));
  assert.ok(finalAttemptPrompts.every((call) => /CORREZIONE VARIETÀ OBBLIGATORIA/i.test(call.sysPrompt)));
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
});

test("un piano incompatibile viene rigenerato automaticamente una sola volta", async (t) => {
  let callNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const incompatibleAttempt = callNumber++ < THREE_MEAL_WEEK_REQUESTS;
    return request.dates.flatMap((date, index) =>
      request.mealTypes.map((mealType) => {
        if (incompatibleAttempt) {
          return makeMeal(date, mealType, `Pasto con latte ${index}`, [
            { name: "latte", quantity: "200", unit: "ml" },
          ]);
        }
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
    );
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { allergies: "Lattosio" },
  });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2, "una sola rigenerazione completa");
  assertCompleteWeek(plan.items, 3);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
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

test("i pasti ripetuti in giorni diversi vengono rigenerati prima della consegna", async (t) => {
  let responseNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const repeatedAttempt = responseNumber++ < THREE_MEAL_WEEK_REQUESTS;
    return request.dates.flatMap((date) => {
      const dayIndex = DATES.indexOf(date);
      return request.mealTypes.map((mealType) => {
        if (repeatedAttempt) {
          if (mealType === "breakfast") {
            return makeMeal(date, mealType, "Yogurt con frutta fresca", [
              { name: "yogurt bianco", quantity: "125", unit: "g" },
              { name: "banana", quantity: "1", unit: "pezzo" },
            ]);
          }
          if (mealType === "lunch") {
            return makeMeal(date, mealType, "Pasta al pomodoro con tonno", [
              { name: "pasta", quantity: "80", unit: "g" },
              { name: "tonno", quantity: "100", unit: "g" },
              { name: "pomodori", quantity: "120", unit: "g" },
            ]);
          }
          return makeMeal(date, mealType, "Orata al forno con patate", [
            { name: "orata", quantity: "150", unit: "g" },
            { name: "patate", quantity: "180", unit: "g" },
            { name: "zucchine", quantity: "150", unit: "g" },
          ]);
        }

        if (mealType === "breakfast") {
          return makeMeal(date, mealType, `Colazione diversa ${dayIndex + 1}`, [
            { name: ["banana", "mela", "pera", "arancia", "kiwi", "mirtilli", "pesca"][dayIndex]!, quantity: "1", unit: "pezzo" },
          ]);
        }
        if (mealType === "lunch") {
          return makeMeal(date, mealType, `Pranzo diverso ${dayIndex + 1}`, [
            { name: `primo ${dayIndex + 1}`, quantity: "80", unit: "g" },
            { name: `proteina ${dayIndex + 1}`, quantity: "100", unit: "g" },
          ]);
        }
        return makeMeal(date, mealType, `Cena diversa ${dayIndex + 1}`, [
          { name: `secondo ${dayIndex + 1}`, quantity: "150", unit: "g" },
          { name: `contorno ${dayIndex + 1}`, quantity: "150", unit: "g" },
        ]);
      });
    });
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START });

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2, "una sola rigenerazione completa per eliminare i doppioni");
  assert.ok(calls.slice(THREE_MEAL_WEEK_REQUESTS).every((call) => /CORREZIONE VARIETÀ OBBLIGATORIA/.test(call.sysPrompt)));
  assertCompleteWeek(plan.items, 3);
  for (const mealType of ["breakfast", "lunch", "dinner"]) {
    const titles = plan.items.filter((item) => item.mealType === mealType).map((item) => item.title);
    assert.equal(new Set(titles).size, 7, `${mealType}: tutti i giorni devono avere un piatto diverso`);
  }
});

test("una risposta incompleta non viene consegnata come settimana valida", async (t) => {
  const { client } = createFakeClient((request) => request.dates.slice(0, 0).flatMap((date) =>
    request.mealTypes.map((mealType) => makeMeal(date, mealType, "Pasto", [{ name: "mela", quantity: "1", unit: "pezzo" }])),
  ));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START }),
    (error: unknown) => (error as { code?: string }).code === "AI_BAD_RESPONSE",
  );
});

test("una risposta incompleta viene rigenerata una sola volta senza inviare piani parziali", async (t) => {
  let callsBeforeCompleteRetry = 0;
  const { client, calls } = createFakeClient((request) => {
    callsBeforeCompleteRetry++;
    if (callsBeforeCompleteRetry <= THREE_MEAL_WEEK_REQUESTS) {
      return request.dates.slice(0, 0).map((date) =>
        makeMeal(date, request.mealTypes[0]!, "Pasto incompleto", [{ name: "mela", quantity: "1", unit: "pezzo" }]));
    }
    return request.dates.flatMap((date, index) => request.mealTypes.map((mealType) => {
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
    }));
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

  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2, "una sola rigenerazione completa");
  assertCompleteWeek(plan.items, 3);
  assert.equal(progress.length, 7, "nessun giorno parziale raggiunge il client");
  assert.deepEqual(validateMealPlanConstraints(plan.items, { allergies: "Lattosio" }), []);
});

test("un alimento da pranzo nel testo della colazione viene rigenerato senza appiattire la ricetta", async (t) => {
  let responseNumber = 0;
  const { client, calls } = createFakeClient((request) => {
    const firstAttempt = responseNumber++ < THREE_MEAL_WEEK_REQUESTS;
    return weekItems(request).map((item) => firstAttempt && item.mealType === "breakfast"
      ? makeMeal(item.date, "breakfast", "Patate al forno", [
          { name: "banana", quantity: "1", unit: "pezzo" },
        ])
      : item);
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
  });
  assert.ok(
    plan.items
      .filter((item) => item.mealType === "breakfast")
      .every((item) => !/\bpatate\b/i.test([
        item.title,
        item.description,
        ...(item.ingredients || []).map((ingredient) => ingredient.name),
        ...(item.steps || []),
      ].join(" "))),
    "la colazione finale non deve conservare il piatto salato",
  );
  assert.equal(calls.length, THREE_MEAL_WEEK_REQUESTS * 2, "una colazione non valida richiede una sola rigenerazione completa");
  assert.ok(
    plan.items.every((item) => (item.steps?.length || 0) >= 3 && (item.steps?.length || 0) <= 6),
    "la rigenerazione deve mantenere una ricetta completa",
  );
});