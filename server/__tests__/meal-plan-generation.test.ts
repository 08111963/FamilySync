import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import {
  __setOpenAiClientForTest,
  generateWeeklyMealPlan,
  MEAL_PLAN_MAX_COMPLETION_TOKENS,
  MAX_MEAL_PLAN_MODEL_CALLS,
} from "../lib/openai";
import {
  MEAL_PLAN_MAX_GENERATION_ATTEMPTS,
  MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MEAL_PLAN_STREAM_SAFETY_TIMEOUT_MS,
} from "../../shared/meal-plan-generation-timeouts";
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";
import {
  evaluateMediterraneanMealPlan,
  planMealPlanLunchFamilies,
} from "../lib/meal-plan-variety";
import { MEAL_PLAN_DIET_PROFILES, type MealPlanDietProfile } from "../../shared/meal-plan-diet-profiles";
import { db } from "../db";
import { aiUsage, familyMembers, families, users } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";
import { recipeImageCacheKey } from "../lib/recipe-image-prewarm";

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
  userMessage: string;
  dates: string[];
  mealTypes: string[];
  itemCount: number;
  slotKeys: string[];
  ingredientNamesAreEnumerated: boolean;
  ingredientMinItems: number;
  ingredientMaxItems: number;
  stepMinItems: number;
  stepMaxItems: number;
  stepMaxLength: number;
  titleMaxLength: number;
  descriptionMaxLength: number;
  tokenLimit: number;
  maxRetries: number | undefined;
  timeout: number | undefined;
};
type FakeMealPlanResponse = Meal[] | { content: string };

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
    if (profile === "lactose_free" || profile === "vegan") {
      return [{ name: "mela", quantity: "1", unit: "pezzo" }, { name: "bevanda di riso", quantity: "200", unit: "ml" }];
    }
    return [{ name: "mela", quantity: "1", unit: "pezzo" }, { name: "yogurt bianco", quantity: "125", unit: "g" }];
  }
  if (profile === "vegetarian") {
    return [
      { name: ["ceci", "uova", "lenticchie"][day % 3]!, quantity: "120", unit: "g" },
      { name: ["pasta", "riso", "patate"][day % 3]!, quantity: "80", unit: "g" },
      { name: "zucchine", quantity: "150", unit: "g" },
    ];
  }
  if (profile === "vegan") {
    return [
      { name: ["tofu", "ceci", "lenticchie", "tempeh", "fagioli", "piselli", "tofu"][day]!, quantity: "120", unit: "g" },
      { name: ["pasta", "riso", "patate", "quinoa", "polenta di mais", "pasta", "riso"][day]!, quantity: "80", unit: "g" },
      { name: "zucchine", quantity: "150", unit: "g" },
    ];
  }
  const glutenFree = profile === "gluten_free";
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
  if (profile === "mediterranean") {
    return balancedMediterraneanWeek(profile, duplicate, includeRedMeat);
  }
  return DATES.flatMap((date, day) => [
    meal(date, "breakfast", duplicate ? "Colazione ripetuta" : `Colazione ${day + 1}`, ingredientsFor(profile, day, "breakfast", includeRedMeat)),
    meal(date, "lunch", `Pranzo ${day + 1}`, ingredientsFor(profile, day, "lunch", includeRedMeat)),
    meal(date, "dinner", `Cena ${day + 1}`, ingredientsFor(profile, day, "dinner", includeRedMeat)),
  ]);
}

function balancedMediterraneanWeek(
  profile: "mediterranean",
  duplicate = false,
  includeRedMeat = true,
): Meal[] {
  const pasta = "pasta";
  const couscous = "couscous";
  const farro = "farro";
  const lunches: Array<{ title: string; ingredients: Ingredient[] }> = [
    { title: `${pasta} al pomodoro con pollo`, ingredients: [{ name: pasta, quantity: "320", unit: "g" }, { name: "pollo", quantity: "320", unit: "g" }, { name: "zucchine", quantity: "400", unit: "g" }] },
    { title: `${pasta} con tonno e melanzane`, ingredients: [{ name: pasta, quantity: "320", unit: "g" }, { name: "tonno", quantity: "240", unit: "g" }, { name: "melanzane", quantity: "400", unit: "g" }] },
    { title: "Riso con merluzzo e spinaci", ingredients: [{ name: "riso", quantity: "320", unit: "g" }, { name: "merluzzo", quantity: "360", unit: "g" }, { name: "spinaci", quantity: "400", unit: "g" }] },
    { title: `${couscous} con ceci e peperoni`, ingredients: [{ name: couscous, quantity: "320", unit: "g" }, { name: "ceci", quantity: "300", unit: "g" }, { name: "peperoni", quantity: "400", unit: "g" }] },
    { title: `${farro} con uova e zucchine`, ingredients: [{ name: farro, quantity: "320", unit: "g" }, { name: "uova", quantity: "6", unit: "pezzi" }, { name: "zucchine", quantity: "400", unit: "g" }] },
    { title: includeRedMeat ? "Patate con manzo e bietole" : "Patate con zucchine e bietole", ingredients: [{ name: "patate", quantity: "700", unit: "g" }, { name: includeRedMeat ? "manzo" : "zucchine", quantity: "320", unit: "g" }, { name: "bietole", quantity: "400", unit: "g" }] },
    { title: "Quinoa con zucchine e carote", ingredients: [{ name: "quinoa", quantity: "320", unit: "g" }, { name: "zucchine", quantity: "400", unit: "g" }, { name: "carote", quantity: "400", unit: "g" }] },
  ];
  const dinners: Array<{ title: string; ingredients: Ingredient[] }> = [
    { title: "Salmone al forno con patate", ingredients: [{ name: "salmone", quantity: "360", unit: "g" }, { name: "patate", quantity: "700", unit: "g" }, { name: "fagiolini", quantity: "400", unit: "g" }] },
    { title: "Uova con spinaci e patate", ingredients: [{ name: "uova", quantity: "6", unit: "pezzi" }, { name: "spinaci", quantity: "400", unit: "g" }, { name: "patate", quantity: "700", unit: "g" }] },
    { title: "Polenta con zucchine e peperoni", ingredients: [{ name: "polenta di mais", quantity: "320", unit: "g" }, { name: "zucchine", quantity: "400", unit: "g" }, { name: "peperoni", quantity: "400", unit: "g" }] },
    { title: "Riso con melanzane e spinaci", ingredients: [{ name: "riso", quantity: "280", unit: "g" }, { name: "melanzane", quantity: "400", unit: "g" }, { name: "spinaci", quantity: "400", unit: "g" }] },
    { title: "Patate con zucca e carote", ingredients: [{ name: "patate", quantity: "700", unit: "g" }, { name: "zucca", quantity: "400", unit: "g" }, { name: "carote", quantity: "400", unit: "g" }] },
    { title: "Quinoa con zucchine e pomodori", ingredients: [{ name: "quinoa", quantity: "280", unit: "g" }, { name: "zucchine", quantity: "400", unit: "g" }, { name: "pomodori", quantity: "400", unit: "g" }] },
    { title: "Riso con funghi e bietole", ingredients: [{ name: "riso", quantity: "280", unit: "g" }, { name: "funghi", quantity: "400", unit: "g" }, { name: "bietole", quantity: "400", unit: "g" }] },
  ];
  return DATES.flatMap((date, day) => [
    meal(date, "breakfast", duplicate ? "Colazione ripetuta" : `Colazione mediterranea ${day + 1}`, ingredientsFor(profile, day, "breakfast")),
    meal(date, "lunch", duplicate ? "Pranzo ripetuto" : lunches[day]!.title, lunches[day]!.ingredients),
    meal(date, "dinner", duplicate ? "Cena ripetuta" : dinners[day]!.title, dinners[day]!.ingredients),
  ]);
}

function cloneMeals(items: Meal[]): Meal[] {
  return items.map((item) => ({
    ...item,
    ingredients: item.ingredients.map((ingredient) => ({ ...ingredient })),
    steps: [...item.steps],
  }));
}

function withoutMediterraneanPasta(items: Meal[]): Meal[] {
  const copy = cloneMeals(items);
  for (const item of copy.filter((entry) => entry.mealType === "lunch")) {
    item.title = item.title.replace(/pasta(?: senza glutine)?/i, "riso");
    item.ingredients = item.ingredients.map((ingredient) =>
      /pasta/i.test(ingredient.name)
        ? { ...ingredient, name: "riso" }
        : ingredient);
  }
  return copy;
}

function createFakeClient(responder: (request: RequestInfo, call: number) => FakeMealPlanResponse) {
  const calls: RequestInfo[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: any, options?: { maxRetries?: number; timeout?: number }) => {
          const prompt = request.messages.find((message: any) => message.role === "system")!.content as string;
          const userMessage = request.messages.find((message: any) => message.role === "user")!.content as string;
          const schema = request.response_format.json_schema.schema;
          const slotKeys = schema.required as string[];
          const firstSlotSchema = schema.properties[slotKeys[0]!];
          const info: RequestInfo = {
            prompt,
            userMessage,
            dates: datesFromPrompt(prompt),
            mealTypes: firstSlotSchema.properties.mealType.enum,
            itemCount: slotKeys.length,
            slotKeys,
            ingredientNamesAreEnumerated: Array.isArray(
              firstSlotSchema.properties.ingredients.items.properties.name.enum,
            ),
            ingredientMinItems: firstSlotSchema.properties.ingredients.minItems,
            ingredientMaxItems: firstSlotSchema.properties.ingredients.maxItems,
            stepMinItems: firstSlotSchema.properties.steps.minItems,
            stepMaxItems: firstSlotSchema.properties.steps.maxItems,
            stepMaxLength: firstSlotSchema.properties.steps.items.maxLength,
            titleMaxLength: firstSlotSchema.properties.title.maxLength,
            descriptionMaxLength: firstSlotSchema.properties.description.maxLength,
            tokenLimit: request.max_completion_tokens,
            maxRetries: options?.maxRetries,
            timeout: options?.timeout,
          };
          calls.push(info);
          const response = responder(info, calls.length);
          const responseItems = Array.isArray(response) && response.length > info.slotKeys.length
            ? response.filter((item) => info.mealTypes.includes(item.mealType))
            : response;
          return {
            choices: [{
              message: {
                content: Array.isArray(responseItems)
                  ? JSON.stringify(Object.fromEntries(
                    info.slotKeys.map((slotKey, index) => [slotKey, responseItems[index]]),
                  ))
                  : responseItems.content,
              },
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
  assert.deepEqual(calls[0]!.slotKeys, Array.from({ length: 21 }, (_, index) => `meal_${String(index + 1).padStart(2, "0")}`));
  assert.equal(
    calls[0]!.ingredientNamesAreEnumerated,
    false,
    "la lista ingredienti chiusa è validata server-side, non duplicata 21 volte nello schema provider",
  );
  assert.equal(calls[0]!.tokenLimit, MEAL_PLAN_MAX_COMPLETION_TOKENS);
  assert.equal(calls[0]!.maxRetries, 0);
  assert.equal(calls[0]!.timeout, MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS);
  assert.ok(
    MEAL_PLAN_STREAM_SAFETY_TIMEOUT_MS > MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS * MEAL_PLAN_MAX_GENERATION_ATTEMPTS,
    "il timeout del browser deve consentire il primo tentativo e l'unico repair",
  );
  assert.equal(calls[0]!.stepMinItems, 3);
  assert.equal(calls[0]!.stepMaxItems, 3);
  assert.equal(calls[0]!.stepMaxLength, 55);
  assert.equal(calls[0]!.ingredientMinItems, 3);
  assert.equal(calls[0]!.ingredientMaxItems, 3);
  assert.equal(calls[0]!.titleMaxLength, 55);
  assert.equal(calls[0]!.descriptionMaxLength, 45);
  assert.match(calls[0]!.prompt, /BLUEPRINT SETTIMANALE LOCALE/);
  assert.match(calls[0]!.prompt, /ESATTAMENTE 3 istruzioni concrete/);
  assert.match(calls[0]!.prompt, /ESATTAMENTE 3 ingredienti essenziali/);
  assert.match(calls[0]!.prompt, /famiglia pasta/);
  assert.match(calls[0]!.prompt, /proteina red_meat/);
  assert.match(calls[0]!.prompt, /almeno 2 pranzi con pasta/);
  assert.match(calls[0]!.prompt, /DISTRIBUZIONE MEDITERRANEA DEI PRANZI/);
  assert.match(calls[0]!.prompt, /pasta in umido/);
  assert.equal(plan.items.length, 21);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "mediterranean" }), []);
  assert.deepEqual(evaluateMediterraneanMealPlan(plan.items).issues, []);
});

test("i profili esclusivi chiedono 14 slot AI e ricompongono 7 colazioni locali sicure", async (t) => {
  for (const profile of ["gluten_free", "lactose_free"] as const) {
    const { client, calls } = createFakeClient(() => fullWeek(profile));
    __setOpenAiClientForTest(client);

    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: profile },
    });

    assert.equal(calls.length, 1, profile);
    assert.deepEqual(calls[0]!.mealTypes, ["lunch", "dinner"], profile);
    assert.equal(calls[0]!.itemCount, 14, profile);
    assert.deepEqual(
      calls[0]!.slotKeys,
      Array.from({ length: 14 }, (_, index) => `meal_${String(index + 1).padStart(2, "0")}`),
      profile,
    );
    assert.doesNotMatch(calls[0]!.prompt, /SOLO questi tipi di pasto: breakfast/i, profile);
    assert.equal(plan.items.length, 21, profile);
    assert.equal(plan.items.filter((item) => item.mealType === "breakfast").length, 7, profile);
    assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: profile }), [], profile);
    assert.ok(
      plan.items
        .filter((item) => item.mealType === "breakfast")
        .every((item) =>
          item.title.trim()
          && item.ingredients?.length === 3
          && item.steps?.length === 3),
      `${profile}: nessuna colazione locale parziale`,
    );
    if (profile === "lactose_free") {
      assert.ok(
        plan.items.some((item) => item.mealType === "breakfast" && /bevanda di riso/i.test(item.title)),
        "la bevanda di riso resta una colazione dolce già verificata",
      );
    }
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("i profili esclusivi mantengono il contratto 7 colazioni locali più 14 slot AI anche con preferenze legacy", async (t) => {
  for (const profile of ["gluten_free", "lactose_free"] as const) {
    for (const mealsPerDay of [2, 4]) {
      const { client, calls } = createFakeClient(() => fullWeek(profile));
      __setOpenAiClientForTest(client);

      const plan = await generateWeeklyMealPlan({
        familySize: 4,
        weekStartDate: WEEK_START,
        preferences: { dietProfile: profile, mealsPerDay },
      });

      assert.equal(calls.length, 1, `${profile}/${mealsPerDay}`);
      assert.deepEqual(calls[0]!.mealTypes, ["lunch", "dinner"], `${profile}/${mealsPerDay}`);
      assert.equal(calls[0]!.itemCount, 14, `${profile}/${mealsPerDay}`);
      assert.equal(plan.items.length, 21, `${profile}/${mealsPerDay}`);
      assert.equal(plan.items.filter((item) => item.mealType === "breakfast").length, 7);
      assert.equal(plan.items.some((item) => item.mealType === "snack"), false);
      assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: profile }), []);
    }
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("mediterranea, vegetariana e vegana ignorano mealsPerDay e mantengono 21 pasti", async (t) => {
  for (const profile of ["mediterranean", "vegetarian", "vegan"] as const) {
    for (const mealsPerDay of [2, 4]) {
      const { client, calls } = createFakeClient(() => fullWeek(profile));
      __setOpenAiClientForTest(client);
      const plan = await generateWeeklyMealPlan({
        familySize: 4,
        weekStartDate: WEEK_START,
        preferences: { dietProfile: profile, mealsPerDay },
      });
      assert.equal(calls.length, 1, `${profile}/${mealsPerDay}`);
      assert.deepEqual(calls[0]!.mealTypes, ["breakfast", "lunch", "dinner"], `${profile}/${mealsPerDay}`);
      assert.equal(calls[0]!.itemCount, 21, `${profile}/${mealsPerDay}`);
      assert.equal(plan.items.length, 21, `${profile}/${mealsPerDay}`);
    }
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("i vecchi profili vengono normalizzati prima di costruire il prompt OpenAI", async (t) => {
  const legacyPreferences = [
    { dietProfile: "balanced" },
    { dietProfile: "light" },
    { dietProfile: "sport" },
    { diet: "balanced" },
    { diet: "light" },
    { diet: "sport" },
  ] as const;

  for (const preferences of legacyPreferences) {
    const { client, calls } = createFakeClient(() => fullWeek("mediterranean"));
    __setOpenAiClientForTest(client);

    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      // Simula record storici che possono ancora arrivare a un chiamante
      // interno pur essendo esclusi dal tipo pubblico dei profili attivi.
      preferences: preferences as unknown as import("../lib/meal-plan-constraints").MealPlanConstraintPreferences,
    });

    assert.equal(plan.items.length, 21);
    assert.equal(calls.length, 1);
    const requestText = `${calls[0]!.prompt}\n${calls[0]!.userMessage}`;
    assert.match(requestText, /Profilo dieta: mediterranean\./);
    assert.doesNotMatch(requestText, /Profilo dieta:\s*(?:balanced|light|sport)\b/i);
    assert.doesNotMatch(requestText, /Dieta\s+(?:Equilibrata|Leggera|Sportiva)/i);
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("il repair gluten-free riceve i termini generici esatti e consegna solo il piano completo", async (t) => {
  const valid = fullWeek("gluten_free");
  const unsafe = cloneMeals(valid);
  const unsafeTerms = ["pasta", "couscous", "pane", "biscotti"];
  unsafe
    .filter((item) => item.mealType !== "breakfast")
    .slice(0, unsafeTerms.length)
    .forEach((item, index) => {
      const term = unsafeTerms[index]!;
      item.title = `${term} con pollo e zucchine`;
      item.ingredients[0] = { name: term, quantity: "80", unit: "g" };
      item.steps[1] = `Cuoci ${term} con le zucchine.`;
    });
  const { client, calls } = createFakeClient((_request, call) => call === 1 ? unsafe : valid);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "gluten_free" },
  });

  assert.equal(calls.length, 2, "primo tentativo più un solo repair");
  assert.equal(calls[0]!.itemCount, 14);
  assert.equal(calls[1]!.itemCount, 14);
  for (const term of unsafeTerms) {
    assert.match(calls[1]!.prompt, new RegExp(`glutine: ${term}`, "i"), term);
  }
  assert.match(calls[1]!.prompt, /Conserva ogni slot già valido/i);
  assert.match(calls[0]!.prompt, /Non usare pasta, couscous, pane, biscotti/i);
  const positiveGlutenFreeGuidance = calls[0]!.prompt
    .split("- PIANO SENZA GLUTINE:")[0]!
    .split("\n")
    .filter((line) => !/non usare mai/i.test(line))
    .join("\n");
  assert.doesNotMatch(
    positiveGlutenFreeGuidance,
    /\b(?:pasta|couscous|pane|biscotti)\b/i,
    "le istruzioni positive gluten-free non devono suggerire basi generiche a rischio",
  );
  assert.equal(plan.items.length, 21);
  assert.equal(new Set(plan.items.map((item) => `${item.date}/${item.mealType}`)).size, 21);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "gluten_free" }), []);
});

test("un output AI incompleto per un profilo esclusivo non espone pasti parziali", async (t) => {
  const valid = fullWeek("lactose_free");
  const { client, calls } = createFakeClient((_request, call) =>
    call === 1
      ? { content: JSON.stringify({ meal_01: valid.find((item) => item.mealType === "lunch") }) }
      : valid);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "lactose_free" },
  });

  assert.equal(calls.length, 2, "un solo repair recupera l'output strutturato incompleto");
  assert.equal(calls[0]!.itemCount, 14);
  assert.equal(calls[1]!.itemCount, 14);
  assert.match(calls[1]!.prompt, /CORREZIONE FORMATO OBBLIGATORIA/);
  assert.equal(plan.items.length, 21);
  assert.equal(new Set(plan.items.map((item) => `${item.date}/${item.mealType}`)).size, 21);
  assert.ok(plan.items.every((item) => item.title && item.ingredients?.length && item.steps?.length));
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "lactose_free" }), []);
});

test("il blueprint mediterraneo distanzia la pasta e non concentra i cereali", () => {
  const targets = planMealPlanLunchFamilies(
    ["pasta", "riso", "ceci", "patate", "pollo", "zucchine"],
    7,
    0,
    { minimumPastaLunches: 2, mediterraneanDistribution: true },
  );

  assert.deepEqual(targets, [
    "pasta",
    "piatto di legumi",
    "patate/polenta",
    "pasta",
    "risotto/riso",
    "piatto di legumi",
    "patate/polenta",
  ]);
  assert.equal(targets.filter((target) => target === "pasta").length, 2);
  assert.ok(targets.every((target, index) =>
    target !== "pasta" || targets[index - 1] !== "pasta"));
  assert.equal(
    targets.filter((target) => target === "risotto/riso" || target === "couscous" ||
      target === "cereale in chicco" || target === "quinoa").length,
    1,
  );
});

test("la validazione mediterranea rifiuta pasta, carne, legumi, termini generici e poca varietà", () => {
  const valid = balancedMediterraneanWeek("mediterranean");
  assert.deepEqual(evaluateMediterraneanMealPlan(valid).issues, []);

  const withoutPasta = withoutMediterraneanPasta(valid);
  assert.ok(
    evaluateMediterraneanMealPlan(withoutPasta).issues.some((issue) =>
      issue.code === "mediterranean-pasta-minimum"),
  );

  const withoutRedMeat = cloneMeals(valid);
  const redMeatLunch = withoutRedMeat.find((item) => item.ingredients.some((ingredient) => ingredient.name === "manzo"))!;
  redMeatLunch.title = "Quinoa con pollo e carote";
  redMeatLunch.ingredients = redMeatLunch.ingredients.map((ingredient) =>
    ingredient.name === "manzo" ? { ...ingredient, name: "pollo" } : ingredient);
  assert.ok(
    evaluateMediterraneanMealPlan(withoutRedMeat).issues.some((issue) =>
      issue.code === "mediterranean-red-meat-minimum"),
  );

  const withoutFish = cloneMeals(valid);
  for (const item of withoutFish) {
    if (!/(salmone|merluzzo|tonno)/i.test(item.title)) continue;
    item.title = item.title.replace(/salmone|merluzzo|tonno/gi, "zucchine");
    item.ingredients = item.ingredients.map((ingredient) =>
      /^(salmone|merluzzo|tonno)$/i.test(ingredient.name)
        ? { ...ingredient, name: "zucchine" }
        : ingredient);
  }
  assert.ok(
    evaluateMediterraneanMealPlan(withoutFish).issues.some((issue) =>
      issue.code === "mediterranean-fish-minimum"),
  );

  const fishOnlyInText = cloneMeals(valid);
  for (const item of fishOnlyInText) {
    item.ingredients = item.ingredients.map((ingredient) =>
      /^(salmone|merluzzo|tonno)$/i.test(ingredient.name)
        ? { ...ingredient, name: "zucchine" }
        : ingredient);
  }
  assert.ok(
    evaluateMediterraneanMealPlan(fishOnlyInText).issues.some((issue) =>
      issue.code === "mediterranean-fish-minimum"),
    "il pesce citato solo nel titolo o nei passaggi non deve contare",
  );

  const tooMuchFish = cloneMeals(valid);
  const fishExtra = tooMuchFish.find((item) => item.title === "Polenta con zucchine e peperoni")!;
  fishExtra.title = "Tonno con polenta e peperoni";
  fishExtra.ingredients[0] = { name: "tonno", quantity: "280", unit: "g" };
  assert.ok(
    evaluateMediterraneanMealPlan(tooMuchFish).issues.some((issue) =>
      issue.code === "mediterranean-fish-maximum"),
  );

  const withoutWhiteMeat = cloneMeals(valid);
  const chickenLunch = withoutWhiteMeat.find((item) => item.title.includes("pollo"))!;
  chickenLunch.title = chickenLunch.title.replace("pollo", "zucchine");
  chickenLunch.ingredients = chickenLunch.ingredients.map((ingredient) =>
    ingredient.name === "pollo" ? { ...ingredient, name: "zucchine" } : ingredient);
  assert.ok(
    evaluateMediterraneanMealPlan(withoutWhiteMeat).issues.some((issue) =>
      issue.code === "mediterranean-white-meat-minimum"),
  );

  const whiteMeatOnlyInText = cloneMeals(valid);
  const chickenOnlyInText = whiteMeatOnlyInText.find((item) => item.title.includes("pollo"))!;
  chickenOnlyInText.ingredients = chickenOnlyInText.ingredients.map((ingredient) =>
    ingredient.name === "pollo" ? { ...ingredient, name: "zucchine" } : ingredient);
  assert.ok(
    evaluateMediterraneanMealPlan(whiteMeatOnlyInText).issues.some((issue) =>
      issue.code === "mediterranean-white-meat-minimum"),
    "la carne bianca citata solo nel titolo o nei passaggi non deve contare",
  );

  const tooMuchWhiteMeat = cloneMeals(valid);
  for (const dinner of tooMuchWhiteMeat.filter((item) => item.mealType === "dinner").slice(2, 5)) {
    dinner.title = `Pollo con ${dinner.ingredients[1]!.name} e ${dinner.ingredients[2]!.name}`;
    dinner.ingredients[0] = { name: "pollo", quantity: "320", unit: "g" };
  }
  assert.ok(
    evaluateMediterraneanMealPlan(tooMuchWhiteMeat).issues.some((issue) =>
      issue.code === "mediterranean-white-meat-maximum"),
  );

  const withoutEggs = cloneMeals(valid);
  for (const item of withoutEggs) {
    if (!/uova/i.test(item.title)) continue;
    item.title = item.title.replace(/uova/gi, "zucchine");
    item.ingredients = item.ingredients.map((ingredient) =>
      ingredient.name === "uova" ? { ...ingredient, name: "zucchine" } : ingredient);
  }
  assert.ok(
    evaluateMediterraneanMealPlan(withoutEggs).issues.some((issue) =>
      issue.code === "mediterranean-eggs-minimum"),
  );

  const egglessFrittata = cloneMeals(valid);
  for (const item of egglessFrittata) {
    if (!/uova/i.test(item.title)) continue;
    item.title = "Frittata di ceci con zucchine";
    item.ingredients = item.ingredients.map((ingredient) =>
      ingredient.name === "uova" ? { ...ingredient, name: "ceci" } : ingredient);
  }
  assert.ok(
    evaluateMediterraneanMealPlan(egglessFrittata).issues.some((issue) =>
      issue.code === "mediterranean-eggs-minimum"),
    "una frittata di ceci senza uova non deve contare come pasto con uova",
  );

  const tooManyEggs = cloneMeals(valid);
  const eggExtra = tooManyEggs.find((item) => item.title === "Polenta con zucchine e peperoni")!;
  eggExtra.title = "Uova con polenta e peperoni";
  eggExtra.ingredients[0] = { name: "uova", quantity: "6", unit: "pezzi" };
  assert.ok(
    evaluateMediterraneanMealPlan(tooManyEggs).issues.some((issue) =>
      issue.code === "mediterranean-eggs-maximum"),
  );

  const tooManyLegumes = cloneMeals(valid);
  for (const [index, dinner] of tooManyLegumes.filter((item) => item.mealType === "dinner").entries()) {
    if (index >= 3) break;
    dinner.title = `Ceci in umido con ortaggi ${index + 1}`;
    dinner.ingredients[0] = { name: "ceci", quantity: "300", unit: "g" };
  }
  assert.ok(
    evaluateMediterraneanMealPlan(tooManyLegumes).issues.some((issue) =>
      issue.code === "mediterranean-legume-maximum"),
  );

  const singularLegumes = cloneMeals(valid);
  for (const [index, dinner] of singularLegumes.filter((item) => item.mealType === "dinner").entries()) {
    if (index >= 3) break;
    dinner.ingredients[0] = {
      name: ["cece nero", "lenticchia rossa", "fagiolo cannellino"][index]!,
      quantity: "300",
      unit: "g",
    };
  }
  assert.ok(
    evaluateMediterraneanMealPlan(singularLegumes).issues.some((issue) =>
      issue.code === "mediterranean-legume-maximum"),
    "anche i legumi al singolare devono concorrere al massimo settimanale",
  );

  for (const forbiddenTerm of [
    "Proteina",
    "Carboidrato",
    "Verdura",
    "Cereale",
    "Verdure miste",
    "Ortaggi di stagione",
    "Cereali misti",
    "Legumi misti",
    "Fonte proteica",
    "Alimento proteico",
  ]) {
    const genericTerm = cloneMeals(valid);
    genericTerm[0]!.ingredients[0] = {
      ...genericTerm[0]!.ingredients[0]!,
      name: forbiddenTerm,
    };
    assert.ok(
      evaluateMediterraneanMealPlan(genericTerm).issues.some((issue) =>
        issue.code === "mediterranean-generic-term"),
      `${forbiddenTerm} deve essere rifiutato`,
    );
  }

  const lowVariety = cloneMeals(valid);
  for (const [index, lunch] of lowVariety.filter((item) => item.mealType === "lunch").entries()) {
    lunch.title = `Pasta al pomodoro con pollo ${index + 1}`;
    lunch.ingredients = [
      { name: "pasta", quantity: "320", unit: "g" },
      { name: "pollo", quantity: "320", unit: "g" },
      { name: "zucchine", quantity: "400", unit: "g" },
    ];
  }
  assert.ok(
    evaluateMediterraneanMealPlan(lowVariety).issues.some((issue) =>
      issue.code === "mediterranean-lunch-variety"),
  );
});

test("la guida mediterranea resta advisory e non ripete la chiamata", async (t) => {
  for (const profile of [
    "mediterranean",
  ] as const) {
    const valid = fullWeek(profile);
    const { client, calls } = createFakeClient((_request, call) =>
      call === 1 ? withoutMediterraneanPasta(valid) : valid);
    __setOpenAiClientForTest(client);

    const plan = await generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: profile },
    });

    assert.equal(calls.length, 1, profile);
    assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: profile }), [], profile);
    assert.ok(evaluateMediterraneanMealPlan(plan.items).issues.length > 0, profile);
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("un ingrediente generico rilevato in produzione riceve un repair puntuale e valido", async (t) => {
  const valid = balancedMediterraneanWeek("mediterranean");
  const generic = cloneMeals(valid);
  const genericDinner = generic.find((item) => item.mealType === "dinner")!;
  genericDinner.ingredients[2] = {
    ...genericDinner.ingredients[2]!,
    name: "verdure miste per umido",
  };
  const { client, calls } = createFakeClient((_request, call) =>
    call === 1 ? generic : valid);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 2, "un solo repair deve correggere il termine generico");
  assert.match(calls[0]!.prompt, /“verdure miste”/);
  assert.match(calls[1]!.prompt, /CATEGORIE GENERICHE VIETATE/);
  assert.match(calls[1]!.prompt, /“verdure miste per umido”/);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "mediterranean" }), []);
});

test("un minimo editoriale di pesce resta osservabile ma non blocca il piano", async (t) => {
  const valid = balancedMediterraneanWeek("mediterranean");
  const fishOnlyInText = cloneMeals(valid);
  for (const item of fishOnlyInText) {
    item.ingredients = item.ingredients.map((ingredient) =>
      /^(salmone|merluzzo|tonno)$/i.test(ingredient.name)
        ? { ...ingredient, name: "zucchine" }
        : ingredient);
  }
  const { client, calls } = createFakeClient(() => fishOnlyInText);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 1);
  assert.ok(
    evaluateMediterraneanMealPlan(plan.items).issues.some((issue) =>
      issue.code === "mediterranean-fish-minimum"),
  );
});

test("un output interrotto per limite non avvia un repair vuoto", async (t) => {
  let calls = 0;
  __setOpenAiClientForTest({
    chat: {
      completions: {
        create: async () => {
          calls++;
          return {
            choices: [{
              message: { content: "" },
              finish_reason: "length",
            }],
          };
        },
      },
    },
  });
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: "mediterranean" },
    }),
    (error: unknown) => (error as { code?: string }).code === "AI_BAD_RESPONSE",
  );
  assert.equal(calls, 1, "un repair senza output parziale ripeterebbe inutilmente la stessa settimana");
});

test("un duplicato editoriale non consuma una seconda chiamata", async (t) => {
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

  assert.equal(calls.length, 1, "la varietà è advisory");
  assert.equal(plan.items.length, 21);
});

test("un primo JSON non parsabile riceve un solo repair full-week", async (t) => {
  const { client, calls } = createFakeClient((_request, call) =>
    call === 1 ? { content: '{"items": ' } : fullWeek("mediterranean"));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1]!.prompt, /CORREZIONE FORMATO OBBLIGATORIA/);
  assert.equal(plan.items.length, 21);
});

test("due JSON non parsabili falliscono dopo due sole chiamate", async (t) => {
  const { client, calls } = createFakeClient(() => ({ content: '{"items": ' }));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({
      familySize: 4,
      weekStartDate: WEEK_START,
      preferences: { dietProfile: "mediterranean" },
    }),
    /Piano pasti non valido dopo 2 tentativi/i,
  );
  assert.equal(calls.length, 2);
});

test("un JSON valido ma con schema incompleto riceve un solo repair", async (t) => {
  const { client, calls } = createFakeClient((_request, call) =>
    call === 1
      ? { content: JSON.stringify({ items: [{ date: DATES[0], mealType: "breakfast" }] }) }
      : fullWeek("mediterranean"));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 2);
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

test("la carne rossa mediterranea resta una guida e non avvia un repair", async (t) => {
  const { client, calls } = createFakeClient((_request, call) =>
    fullWeek("mediterranean", false, call > 1));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(validateMealPlanConstraints(plan.items, { dietProfile: "mediterranean" }), []);
});

test("un piano duplicato ma strutturalmente valido viene consegnato", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean", true));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
  });
  assert.equal(plan.items.length, 21);
  assert.equal(calls.length, 1);
});

test("tutti i cinque profili chiusi usano un solo contratto completo e restano sicuri", async (t) => {
  for (const profile of MEAL_PLAN_DIET_PROFILES) {
    const fixture = fullWeek(profile);
    assert.deepEqual(
      validateMealPlanConstraints(fixture, { dietProfile: profile }),
      [],
      `${profile}: fixture compatibile`,
    );
    const { client, calls } = createFakeClient(() => fixture);
    __setOpenAiClientForTest(client);
    let plan;
    try {
      plan = await generateWeeklyMealPlan({
        familySize: 4,
        weekStartDate: WEEK_START,
        preferences: { dietProfile: profile },
      });
    } catch (error) {
      throw new Error(`${profile}: ${(error as Error).message}`, { cause: error });
    }
    assert.equal(calls.length, 1, `${profile}: una chiamata`);
    assert.equal(plan.items.length, 21, `${profile}: settimana completa`);
    assert.deepEqual(
      validateMealPlanConstraints(plan.items, { dietProfile: profile }),
      [],
      `${profile}: piano sicuro`,
    );
    if (profile === "vegan") {
      assert.match(calls[0]!.prompt, /PROFILO VEGANO/i);
    }
  }
  t.after(() => __setOpenAiClientForTest(null));
});

test("un budget applicativo di una chiamata consegna un piano con difetti editoriali", async (t) => {
  const { client, calls } = createFakeClient(() => fullWeek("mediterranean", true));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { dietProfile: "mediterranean" },
    maxModelCalls: 1,
  });
  assert.equal(plan.items.length, 21);
  assert.equal(calls.length, 1);
});

test(
  "lo stream invia heartbeat senza pasti mentre il provider è lento e consegna solo il piano validato",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL non impostata" },
  async (t) => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";

    const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `meal-plan-stream-${marker}@example.com`;
    const validPlan = fullWeek("vegetarian").map((item) => ({
      ...item,
      title: `${item.title} ${marker}`,
    }));
    const invalidPlan = cloneMeals(fullWeek("vegetarian")).map((item) => ({
      ...item,
      title: `${item.title} ${marker}`,
    }));
    const unsafeItem = invalidPlan.find((item) => item.mealType === "lunch")!;
    unsafeItem.title = `Pollo con riso ${marker}`;
    unsafeItem.ingredients[0] = { name: "pollo", quantity: "120", unit: "g" };
    // La rotta avvia il prewarm delle immagini dopo res.end(). Per mantenere
    // il test focalizzato sullo stream (e non inviare richieste immagini),
    // rendiamo disponibili solo le cache sintetiche dei titoli finali.
    const cachedRecipeImagePaths = Array.from(new Set(
      validPlan.map((item) => path.resolve(
        "uploads",
        "recipe-images",
        `${recipeImageCacheKey(item.title)}.webp`,
      )),
    ));
    for (const imagePath of cachedRecipeImagePaths) {
      fs.writeFileSync(imagePath, "");
    }
    const [user] = await db.insert(users).values({
      email,
      passwordHash: "x".repeat(20),
      name: "Meal plan stream test",
      emailVerified: true,
      termsAcceptedAt: new Date(),
      aiFeaturesEnabled: true,
      ageBand: "adult",
    }).returning();
    const [family] = await db.insert(families).values({ name: `Meal plan stream ${marker}` }).returning();
    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: user.id,
      role: "adult",
      nickname: "Test",
      color: "#6366F1",
      points: 0,
    });

    let server: Server | undefined;
    let baseUrl = "";
    const providerStartedAt: number[] = [];
    const providerResolvedAt: number[] = [];
    let providerCalls = 0;

    t.after(async () => {
      __setOpenAiClientForTest(null);
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      // Consente al fire-and-forget del prewarm di osservare i cache-hit prima
      // di rimuovere gli utenti/famiglia sintetici.
      await new Promise((resolve) => setTimeout(resolve, 25));
      await db.delete(aiUsage).where(eq(aiUsage.familyId, family.id));
      await db.delete(familyMembers).where(eq(familyMembers.familyId, family.id));
      await db.delete(families).where(eq(families.id, family.id));
      await db.delete(users).where(eq(users.id, user.id));
      for (const imagePath of cachedRecipeImagePaths) {
        fs.rmSync(imagePath, { force: true });
      }
    });

    const slowClient = {
      chat: {
        completions: {
          create: async (request: any) => {
            providerCalls++;
            if (providerCalls === 1) {
              providerStartedAt.push(Date.now());
              // Deve superare il battito di 8 secondi della rotta, non solo
              // l'aggiornamento iniziale scritto prima della chiamata AI.
              await new Promise((resolve) => setTimeout(resolve, 8_400));
            }
            providerResolvedAt.push(Date.now());
            const responseItems = providerCalls === 1 ? invalidPlan : validPlan;
            const slotKeys = request.response_format.json_schema.schema.required as string[];
            return {
              choices: [{
                message: {
                  content: JSON.stringify(Object.fromEntries(
                    slotKeys.map((slotKey, index) => [slotKey, responseItems[index]]),
                  )),
                },
                finish_reason: "stop",
              }],
            };
          },
        },
      },
    };
    __setOpenAiClientForTest(slowClient);

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const requestId = "mealplan-slow-provider";
    const dietProfile = "vegetarian";
    const requestStartedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/ai/${family.id}/weekly-meal-plan/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${generateAccessToken(user)}`,
      },
      body: JSON.stringify({
        weekStartDate: WEEK_START,
        requestId,
        preferences: { dietProfile },
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    assert.equal(response.headers.get("x-meal-plan-request-id"), requestId);
    assert.ok(response.body);

    type StreamEvent = {
      type?: string;
      requestId?: string;
      dietProfile?: string;
      message?: string;
      items?: unknown[];
      title?: string;
    };
    const events: StreamEvent[] = [];
    const eventTimes: number[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        events.push(JSON.parse(line) as StreamEvent);
        eventTimes.push(Date.now());
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      events.push(JSON.parse(buffer) as StreamEvent);
      eventTimes.push(Date.now());
    }

    assert.equal(providerCalls, 2, "il primo output non valido deve causare un solo repair");
    assert.ok(events.length >= 4, "lo stream deve contenere stato iniziale, heartbeat, repair e risultato");
    const statusEvents = events.filter((event) => event.type === "status");
    assert.ok(statusEvents.length >= 2, "un provider lento deve produrre almeno un heartbeat oltre allo stato iniziale");
    const heartbeatDuringSlowProviderIndex = events.findIndex(
      (event, index) =>
        event.type === "status"
        && event.message === "Sto ancora componendo le ricette della settimana."
        // Margine di 500ms: il timer della rotta scatta a 8s, mentre il
        // provider di test risponde a 8,4s. Senza setInterval non può esistere
        // uno stato in questa finestra, perché gli altri stati sono inviati
        // prima della prima chiamata o dopo la sua risposta.
        && eventTimes[index]! >= providerStartedAt[0]! + 7_500
        && eventTimes[index]! >= requestStartedAt + 7_500
        && eventTimes[index]! < providerResolvedAt[0]!,
    );
    assert.ok(
      heartbeatDuringSlowProviderIndex >= 0,
      "deve arrivare un heartbeat circa 8 secondi dopo l'avvio, prima della risposta lenta del provider",
    );
    for (const event of events) {
      assert.equal(event.requestId, requestId);
      assert.equal(event.dietProfile, dietProfile);
    }
    for (const event of statusEvents) {
      assert.deepEqual(
        Object.keys(event).sort(),
        ["dietProfile", "message", "requestId", "type"],
        "gli stati devono contenere solo metadati e messaggio, mai contenuto generato",
      );
      assert.equal("items" in event, false, "gli stati non devono contenere pasti");
      assert.equal("title" in event, false, "gli stati non devono contenere contenuto generato");
      assert.equal(typeof event.message, "string");
    }

    const firstMealsIndex = events.findIndex(
      (event) => event.type === "items" && Array.isArray(event.items) && event.items.length > 0,
    );
    assert.ok(firstMealsIndex >= 0, "lo stream deve consegnare il piano finale");
    assert.ok(
      events.slice(0, firstMealsIndex).every((event) => event.type === "status"),
      "nessun evento con pasti deve precedere la validazione finale",
    );
    assert.equal(events[firstMealsIndex]!.items!.length, 21);
    assert.ok(
      eventTimes[firstMealsIndex]! >= providerResolvedAt[1]!,
      "il primo evento con pasti arriva dopo il secondo tentativo del provider, quello validato",
    );
    assert.equal(events[events.length - 1]!.type, "done");
    assert.equal(events[events.length - 1]!.items!.length, 21);
  },
);

test(
  "la disconnessione dallo stream annulla la chiamata AI senza avviare un duplicato",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL non impostata" },
  async (t) => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";

    const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [user] = await db.insert(users).values({
      email: `meal-plan-disconnect-${marker}@example.com`,
      passwordHash: "x".repeat(20),
      name: "Meal plan disconnect test",
      emailVerified: true,
      termsAcceptedAt: new Date(),
      aiFeaturesEnabled: true,
      ageBand: "adult",
    }).returning();
    const [family] = await db.insert(families).values({
      name: `Meal plan disconnect ${marker}`,
    }).returning();
    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: user.id,
      role: "adult",
      nickname: "Test",
      color: "#6366F1",
      points: 0,
    });

    let server: Server | undefined;
    t.after(async () => {
      __setOpenAiClientForTest(null);
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      await db.delete(aiUsage).where(eq(aiUsage.familyId, family.id));
      await db.delete(familyMembers).where(eq(familyMembers.familyId, family.id));
      await db.delete(families).where(eq(families.id, family.id));
      await db.delete(users).where(eq(users.id, user.id));
    });

    let providerCalls = 0;
    let resolveProviderAbort: (() => void) | undefined;
    const providerAborted = new Promise<void>((resolve) => {
      resolveProviderAbort = resolve;
    });
    const cancellableClient = {
      chat: {
        completions: {
          create: async (_request: unknown, options?: { signal?: AbortSignal }) => {
            providerCalls++;
            await new Promise<never>((_resolve, reject) => {
              const abort = () => {
                resolveProviderAbort?.();
                const error = new Error("client disconnected");
                error.name = "AbortError";
                reject(error);
              };
              if (options?.signal?.aborted) {
                abort();
              } else {
                options?.signal?.addEventListener("abort", abort, { once: true });
              }
            });
          },
        },
      },
    };
    __setOpenAiClientForTest(cancellableClient);

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const clientAbortController = new AbortController();
    const response = await fetch(`${baseUrl}/api/ai/${family.id}/weekly-meal-plan/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${generateAccessToken(user)}`,
      },
      body: JSON.stringify({
        weekStartDate: WEEK_START,
        requestId: "mealplan-disconnect-provider",
        preferences: { dietProfile: "vegetarian" },
      }),
      signal: clientAbortController.signal,
    });
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body!.getReader();
    const firstEvent = await reader.read();
    assert.equal(firstEvent.done, false, "il client deve ricevere lo stato iniziale prima della disconnessione");

    await reader.cancel();
    clientAbortController.abort();
    await Promise.race([
      providerAborted,
      new Promise<void>((_resolve, reject) => setTimeout(
        () => reject(new Error("la disconnessione non ha annullato il provider")),
        2_000,
      )),
    ]);
    assert.equal(providerCalls, 1, "la disconnessione non deve avviare un secondo tentativo AI");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const usageRows = await db.select().from(aiUsage).where(eq(aiUsage.familyId, family.id));
    assert.equal(usageRows.length, 1, "la disconnessione deve lasciare un solo slot di utilizzo");
    assert.equal(usageRows[0]!.status, "failed", "lo slot interrotto deve essere finalizzato");
  },
);