import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import {
  __setOpenAiClientForTest,
  generateWeeklyMealPlan,
  MAX_MEAL_PLAN_MODEL_CALLS,
} from "../lib/openai";
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";
import { MEAL_PLAN_DIET_PROFILES, type MealPlanDietProfile } from "../../shared/meal-plan-diet-profiles";

const WEEK_START = "2026-08-03";
const DATES = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(WEEK_START);
  date.setDate(date.getDate() + index);
  return date.toISOString().slice(0, 10);
});

type Ingredient = { name: string; quantity: string; unit: string };
type Meal = {
  date: string;
  mealType: "breakfast" | "lunch" | "dinner";
  title: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
};
type RequestInfo = {
  prompt: string;
  dates: string[];
  mealTypes: string[];
  itemCount: number;
  tokenLimit: number;
};

function datesFromPrompt(prompt: string): string[] {
  const match = prompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./);
  assert.ok(match, "il prompt dichiara tutte le date richieste");
  return match[1]!.split(",").map((value) => value.trim()).filter(Boolean);
}

function meal(date: string, mealType: Meal["mealType"], title: string, ingredients: Ingredient[]): Meal {
  return {
    date,
    mealType,
    title,
    description: "Ricetta completa e compatibile.",
    ingredients,
    steps: [
      "Lava e prepara gli ingredienti indicati.",
      "Cuoci gli ingredienti con la tecnica prevista.",
      "Assembla il piatto e servilo caldo.",
    ],
  };
}

function ingredientsFor(
  profile: MealPlanDietProfile | undefined,
  day: number,
  mealType: Meal["mealType"],
  includeRedMeat = true,
): Ingredient[] {
  if (mealType === "breakfast") {
    if (profile === "mediterranean_lactose_free" || profile === "vegan") {
      return [{ name: "mela", quantity: "1", unit: "pezzo" }, { name: "bevanda di riso", quantity: "200", unit: "ml" }];
    }
    return [{ name: "mela", quantity: "1", unit: "pezzo" }, { name: "yogurt bianco", quantity: "125", unit: "g" }];
  }
  if (profile === "low_carb") {
    return [
      { name: day % 2 ? "uova" : "pollo", quantity: "120", unit: "g" },
      { name: day % 3 ? "zucchine" : "broccoli", quantity: "180", unit: "g" },
    ];
  }
  if (profile === "vegan") {
    return [
      { name: ["ceci", "lenticchie", "fagioli"][day % 3]!, quantity: "120", unit: "g" },
      { name: ["quinoa", "patate", "riso"][day % 3]!, quantity: "80", unit: "g" },
      { name: "zucchine", quantity: "150", unit: "g" },
    ];
  }
  if (profile === "vegetarian" || profile === "vegetarian_gluten_free") {
    return [
      { name: ["ceci", "uova", "lenticchie"][day % 3]!, quantity: "120", unit: "g" },
      { name: profile === "vegetarian_gluten_free" ? ["riso", "quinoa", "patate"][day % 3]! : ["pasta", "riso", "patate"][day % 3]!, quantity: "80", unit: "g" },
      { name: "zucchine", quantity: "150", unit: "g" },
    ];
  }
  if (profile === "pescetarian") {
    return [
      { name: ["merluzzo", "salmone", "tonno"][day % 3]!, quantity: "120", unit: "g" },
      { name: ["riso", "patate", "quinoa"][day % 3]!, quantity: "80", unit: "g" },
      { name: "spinaci", quantity: "150", unit: "g" },
    ];
  }
  if (profile === "halal") {
    return [
      { name: ["pollo", "tacchino", "ceci"][day % 3]!, quantity: "120", unit: "g" },
      { name: ["riso", "patate", "quinoa"][day % 3]!, quantity: "80", unit: "g" },
      { name: "zucchine", quantity: "150", unit: "g" },
    ];
  }
  const glutenFree = profile === "mediterranean_gluten_free";
  const carbohydrate = glutenFree
    ? ["pasta senza glutine", "riso", "quinoa", "patate", "couscous di mais senza glutine", "polenta di mais", "lenticchie"][day]!
    : ["pasta", "riso", "quinoa", "patate", "couscous", "farro", "lenticchie"][day]!;
  return [
      { name: includeRedMeat && day === 6 ? "manzo" : ["pollo", "merluzzo", "ceci"][day % 3]!, quantity: "120", unit: "g" },
    { name: carbohydrate, quantity: "80", unit: "g" },
    { name: "zucchine", quantity: "150", unit: "g" },
  ];
}

function fullWeek(profile?: MealPlanDietProfile, duplicate = false, includeRedMeat = true): Meal[] {
  return DATES.flatMap((date, day) => [
    meal(date, "breakfast", duplicate ? "Colazione ripetuta" : `Colazione ${day + 1}`, ingredientsFor(profile, day, "breakfast", includeRedMeat)),
    meal(date, "lunch", profile === "low_carb" ? `Pranzo low carb ${day + 1}` : `Pranzo ${day + 1}`, ingredientsFor(profile, day, "lunch", includeRedMeat)),
    meal(date, "dinner", `Cena ${day + 1}`, ingredientsFor(profile, day, "dinner", includeRedMeat)),
  ]);
}

function createFakeClient(responder: (request: RequestInfo, call: number) => Meal[]) {
  const calls: RequestInfo[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: any) => {
          const prompt = request.messages.find((message: any) => message.role === "system")!.content as string;
          const schema = request.response_format.json_schema.schema;
          const info: RequestInfo = {
            prompt,
            dates: datesFromPrompt(prompt),
            mealTypes: schema.properties.items.items.properties.mealType.enum,
            itemCount: schema.properties.items.minItems,
            tokenLimit: request.max_completion_tokens,
          };
          calls.push(info);
          return {
            choices: [{
              message: { content: JSON.stringify({ items: responder(info, calls.length) }) },
              finish_reason: "stop",
            }],
          };
        },
      },
    },
  };
  return { client, calls };
}

test("genera tutti i 21 pasti con una sola chiamata e blueprint locale settimanale", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean"));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.dates, DATES);
  assert.deepEqual(calls[0]!.mealTypes, ["breakfast", "lunch", "dinner"]);
  assert.equal(calls[0]!.itemCount, 21);
  assert.equal(calls[0]!.tokenLimit, 7000);
  assert.match(calls[0]!.prompt, /BLUEPRINT SETTIMANALE LOCALE/);
  assert.match(calls[0]!.prompt, /famiglia pasta/);
  assert.match(calls[0]!.prompt, /proteina red_meat/);
  assert.equal(plan.items.length, 21);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "mediterranean" }), []);
});

test("un duplicato deterministico esegue un solo repair con il JSON precedente", async (t) => {
  const { client, calls } = createFakeClient((_request, call) =>
    fullWeek("mediterranean", call === 1));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
    maxModelCalls: MAX_MEAL_PLAN_MODEL_CALLS,
  });

  assert.equal(calls.length, 2, "prima chiamata + un solo repair");
  assert.match(calls[1]!.prompt, /JSON DEL PIANO PRECEDENTE DA CORREGGERE/);
  assert.match(calls[1]!.prompt, /CORREZIONE VARIETÀ OBBLIGATORIA/);
  assert.equal(plan.items.length, 21);
});

test("il piano alternativo usa lo stesso contratto full-week e una sola chiamata", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean"));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
    planVariant: 2,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.prompt, /Piano B|alternativa|creativo/i);
  assert.equal(plan.items.length, 21);
});

test("la carne rossa mediterranea mancante avvia un solo repair e non viene aggirata", async (t) => {
  const { client, calls } = createFakeClient((_request, call) =>
    fullWeek("mediterranean", false, call > 1));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1]!.prompt, /carne rossa|manzo|vitello|agnello/i);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "mediterranean" }), []);
});

test("dopo un repair ancora duplicato fallisce senza una terza chiamata", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean", true));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: "mediterranean" },
    }),
    /piano completo richiede una correzione/i,
  );
  assert.equal(calls.length, 2);
});

test("tutti i nove profili chiusi usano un solo contratto completo e restano sicuri", async (t) => {
  for (const profile of MEAL_PLAN_DIET_PROFILES) {
    const { client, calls } = createFakeClient(() => fullWeek(profile));
    __setOpenAiClientForTest(client);
    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: profile },
    });
    assert.equal(calls.length, 1, `${profile}: una chiamata`);
    assert.equal(plan.items.length, 21, `${profile}: settimana completa`);
    assert.deepEqual(
      validateMealPlanConstraints(plan.items, { dietProfile: profile }),
      [],
      `${profile}: piano sicuro`,
    );
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("un budget applicativo di una chiamata non avvia il repair", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean", true));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: "mediterranean" },
      maxModelCalls: 1,
    }),
    (error: unknown) => (error as { code?: string }).code === "AI_MODEL_CALL_BUDGET_EXHAUSTED",
  );
  assert.equal(calls.length, 1);
});