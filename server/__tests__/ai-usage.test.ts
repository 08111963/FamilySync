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

async function runMiddleware(feature: AiFeature) {
  const req = makeReq();
  const res = makeRes();
  let nextCalled = false;
  await aiRateLimit(feature)(req, res as any, () => {
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

  test("rigenerazione weekly-meal-plan bloccata dopo 3 usi riusciti", async () => {
    let used = 3;
    __setQuotaCounterForTest(async () => used);
    let r = await runMiddleware("weekly-meal-plan");
    assert.equal(r.res.statusCode, 429, "il 4o tentativo deve essere bloccato");
    used = 2;
    r = await runMiddleware("weekly-meal-plan");
    assert.equal(r.nextCalled, true, "con 2 usi deve passare");
  });

  test("errore nel conteggio quota -> non blocca l'utente (fail-open)", async () => {
    __setQuotaCounterForTest(async () => {
      throw new Error("db down");
    });
    const { res, nextCalled } = await runMiddleware("insights");
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
  });
});
