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
import { validateMealPlanConstraints } from "../lib/meal-plan-constraints";
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
  dates: string[];
  mealTypes: string[];
  itemCount: number;
  stepMinItems: number;
  stepMaxItems: number;
  tokenLimit: number;
  maxRetries: number | undefined;
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

function createFakeClient(responder: (request: RequestInfo, call: number) => FakeMealPlanResponse) {
  const calls: RequestInfo[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: any, options?: { maxRetries?: number }) => {
          const prompt = request.messages.find((message: any) => message.role === "system")!.content as string;
          const schema = request.response_format.json_schema.schema;
          const info: RequestInfo = {
            prompt,
            dates: datesFromPrompt(prompt),
            mealTypes: schema.properties.items.items.properties.mealType.enum,
            itemCount: schema.properties.items.minItems,
            stepMinItems: schema.properties.items.items.properties.steps.minItems,
            stepMaxItems: schema.properties.items.items.properties.steps.maxItems,
            tokenLimit: request.max_completion_tokens,
            maxRetries: options?.maxRetries,
          };
          calls.push(info);
          const response = responder(info, calls.length);
          return {
            choices: [{
              message: {
                content: Array.isArray(response)
                  ? JSON.stringify({ items: response })
                  : response.content,
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
  assert.equal(calls[0]!.tokenLimit, MEAL_PLAN_MAX_COMPLETION_TOKENS);
  assert.equal(calls[0]!.maxRetries, 0);
  assert.equal(calls[0]!.stepMinItems, 3);
  assert.equal(calls[0]!.stepMaxItems, 3);
  assert.match(calls[0]!.prompt, /BLUEPRINT SETTIMANALE LOCALE/);
  assert.match(calls[0]!.prompt, /ESATTAMENTE 3 istruzioni concise/);
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
    /piano completo richiede una correzione/i,
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
    const invalidPlan = fullWeek("vegetarian", true).map((item) => ({
      ...item,
      title: `${item.title} ${marker}`,
    }));
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
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ items: responseItems }),
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