import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AI_DAILY_LIMITS,
  aiRateLimit,
  __setQuotaCounterForTest,
  __resetQuotaCounterForTest,
  type AiFeature,
} from "../lib/ai-usage";

afterEach(() => {
  __resetQuotaCounterForTest();
});

type FakeRes = {
  statusCode?: number;
  body?: any;
  status: (c: number) => FakeRes;
  json: (b: any) => FakeRes;
};

function makeRes(): FakeRes {
  const res: FakeRes = {
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: any) {
      res.body = b;
      return res;
    },
  };
  return res;
}

function makeReq(familyId = "fam-1") {
  return { params: { familyId } } as any;
}

async function runMiddleware(feature: AiFeature, options: { failOpen?: boolean } = {}) {
  const req = makeReq();
  const res = makeRes();
  let nextCalled = false;
  await aiRateLimit(feature, options)(req, res as any, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe("AI_DAILY_LIMITS", () => {
  test("valori attesi per ogni feature", () => {
    assert.equal(AI_DAILY_LIMITS["shopping-suggestions"], 10);
    assert.equal(AI_DAILY_LIMITS["recipe-search"], 20);
    assert.equal(AI_DAILY_LIMITS["recipe-suggestions"], 10);
    assert.equal(AI_DAILY_LIMITS["weekly-meal-plan"], 3);
    assert.equal(AI_DAILY_LIMITS.insights, 5);
    assert.equal(AI_DAILY_LIMITS["chore-optimization"], 10);
  });
});

describe("aiRateLimit middleware", () => {
  test("sotto quota -> next() chiamato, nessuna risposta di errore", async () => {
    __setQuotaCounterForTest(async () => 2);
    const { res, nextCalled } = await runMiddleware("weekly-meal-plan");
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
  });

  test("quota raggiunta esattamente -> 429 AI_RATE_LIMITED, next() non chiamato", async () => {
    __setQuotaCounterForTest(async () => 3);
    const { res, nextCalled } = await runMiddleware("weekly-meal-plan");
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body?.error?.code, "AI_RATE_LIMITED");
  });

  test("quota superata -> 429", async () => {
    __setQuotaCounterForTest(async () => 99);
    const { res, nextCalled } = await runMiddleware("shopping-suggestions");
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
  });

  test("rigenerazione weekly-meal-plan bloccata dopo 3 usi riusciti (prima di OpenAI)", async () => {
    // next() simula l'handler che chiamerebbe OpenAI: se viene bloccato,
    // next NON viene chiamato -> nessuna chiamata OpenAI.
    let used = 3;
    __setQuotaCounterForTest(async () => used);
    let r = await runMiddleware("weekly-meal-plan");
    assert.equal(r.res.statusCode, 429, "il 4o tentativo deve essere bloccato");
    assert.equal(r.nextCalled, false, "l'handler/OpenAI non deve essere raggiunto");
    used = 2;
    r = await runMiddleware("weekly-meal-plan");
    assert.equal(r.nextCalled, true, "con 2 usi deve passare");
  });

  test("weekly-meal-plan: il limite è verificato PRIMA della generazione (rigenerazioni ripetute bloccate)", async () => {
    // Simula uno scenario realistico: ad ogni generazione riuscita il contatore
    // cresce. Alla 4a rigenerazione (used=3) deve scattare il blocco prima di OpenAI.
    let successes = 0;
    let openAiCalls = 0;
    __setQuotaCounterForTest(async () => successes);
    for (let attempt = 0; attempt < 5; attempt++) {
      const req = makeReq();
      const res = makeRes();
      let reachedHandler = false;
      await aiRateLimit("weekly-meal-plan")(req, res as any, () => {
        reachedHandler = true;
      });
      if (reachedHandler) {
        openAiCalls++; // l'handler avrebbe chiamato OpenAI
        successes++; // recordAiUsage(success=true)
      }
    }
    assert.equal(openAiCalls, 3, "solo 3 generazioni OpenAI consentite al giorno");
    assert.equal(successes, 3);
  });

  describe("fail-closed quota (funzioni costose)", () => {
    const expensive: AiFeature[] = [
      "weekly-meal-plan",
      "recipe-suggestions",
      "recipe-search",
      "insights",
      "chore-optimization",
    ];
    for (const feature of expensive) {
      test(`${feature}: errore nel controllo quota -> 503 AI_USAGE_UNAVAILABLE, OpenAI non raggiunto`, async () => {
        __setQuotaCounterForTest(async () => {
          throw new Error("db down");
        });
        const { res, nextCalled } = await runMiddleware(feature);
        assert.equal(nextCalled, false, "l'handler/OpenAI non deve essere raggiunto");
        assert.equal(res.statusCode, 503);
        assert.equal(res.body?.error?.code, "AI_USAGE_UNAVAILABLE");
      });
    }
  });

  test("shopping-suggestions con failOpen -> errore quota non blocca (ha fallback)", async () => {
    __setQuotaCounterForTest(async () => {
      throw new Error("db down");
    });
    const { res, nextCalled } = await runMiddleware("shopping-suggestions", { failOpen: true });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
  });
});
