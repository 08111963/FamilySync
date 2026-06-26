import { test, describe, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  AI_DAILY_LIMITS,
  reserveAiSlot,
  finalizeAiUsage,
  withAiUsage,
  __setAiUsageStoreForTest,
  __resetAiUsageStoreForTest,
  type AiUsageStore,
  type AiUsageStatus,
  type ReserveResult,
} from "../lib/ai-usage";
import { AiError, mapOpenAiError } from "../lib/ai-errors";

const AI_KEY_ENV = "AI_INTEGRATIONS_OPENAI_API_KEY";
const ORIGINAL_AI_KEY = process.env[AI_KEY_ENV];

// reserveAiSlot ora richiede la chiave OpenAI presente (assertAiConfigured).
// La impostiamo per la maggior parte dei test; i test "chiave mancante" la
// rimuovono e ripristinano localmente.
before(() => {
  if (!process.env[AI_KEY_ENV]) process.env[AI_KEY_ENV] = "test-openai-key";
});
after(() => {
  if (ORIGINAL_AI_KEY === undefined) delete process.env[AI_KEY_ENV];
  else process.env[AI_KEY_ENV] = ORIGINAL_AI_KEY;
});

afterEach(() => {
  __resetAiUsageStoreForTest();
});

/**
 * Store in memoria ATOMICO che emula il comportamento del DB reale:
 * il conteggio + insert "started" sono serializzati (come l'advisory lock
 * Postgres), così due richieste concorrenti non possono superare il limite.
 * NB: l'atomicità reale in produzione è garantita da pg_advisory_xact_lock;
 * qui verifichiamo il CONTRATTO (nessun overshoot, stati corretti).
 */
function makeMemoryStore() {
  type Row = { id: string; feature: string; familyId: string; status: AiUsageStatus };
  const rows: Row[] = [];
  let seq = 0;
  // Catena di promesse per serializzare le prenotazioni (emula il lock).
  let lock: Promise<unknown> = Promise.resolve();

  function runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = lock.then(() => fn());
    lock = result.then(() => undefined, () => undefined);
    return result;
  }

  const store: AiUsageStore = {
    async reserve(_userId, familyId, feature, max): Promise<ReserveResult> {
      return runExclusive(async () => {
        // Piccola attesa per amplificare eventuali race se NON fossimo serializzati.
        await new Promise((r) => setTimeout(r, 1));
        const used = rows.filter((r) => r.familyId === familyId && r.feature === feature).length;
        if (used >= max) return { status: "limited", used, max };
        const id = `usage-${++seq}`;
        rows.push({ id, feature, familyId, status: "started" });
        return { status: "ok", usageId: id, used: used + 1 };
      });
    },
    async finalize(usageId, success) {
      const row = rows.find((r) => r.id === usageId);
      if (row) row.status = success ? "succeeded" : "failed";
    },
  };

  return { store, rows };
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

describe("reserveAiSlot / finalizeAiUsage", () => {
  test("sotto quota -> ok, crea record 'started'", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    const r = await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
    assert.equal(r.status, "ok");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, "started");
  });

  test("finalize aggiorna 'started' -> 'succeeded'/'failed'", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    const r1 = await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
    assert.equal(r1.status, "ok");
    if (r1.status !== "ok") return;
    await finalizeAiUsage(r1.usageId, true);
    assert.equal(rows[0]!.status, "succeeded");

    const r2 = await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
    if (r2.status !== "ok") return;
    await finalizeAiUsage(r2.usageId, false);
    assert.equal(rows[1]!.status, "failed");
  });

  test("quota raggiunta -> 'limited' (OpenAI non va chiamato)", async () => {
    const { store } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    // weekly-meal-plan max = 3
    for (let i = 0; i < 3; i++) {
      const r = await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
      assert.equal(r.status, "ok");
    }
    const blocked = await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
    assert.equal(blocked.status, "limited");
    if (blocked.status === "limited") assert.equal(blocked.max, 3);
  });

  test("famiglie diverse hanno quote indipendenti", async () => {
    const { store } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    for (let i = 0; i < 3; i++) await reserveAiSlot("u1", "fam-A", "weekly-meal-plan");
    const otherFamily = await reserveAiSlot("u2", "fam-B", "weekly-meal-plan");
    assert.equal(otherFamily.status, "ok");
  });
});

describe("withAiUsage", () => {
  test("successo -> outcome 'ok' + usage 'succeeded'", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    const run = await withAiUsage(
      { userId: "u1", familyId: "fam-1", feature: "recipe-suggestions" },
      async () => ({ recipes: [] }),
    );
    assert.equal(run.outcome, "ok");
    assert.equal(rows[0]!.status, "succeeded");
  });

  test("chiave OpenAI mancante -> AI_NOT_CONFIGURED, store.reserve mai chiamato (nessun record)", async () => {
    const { store, rows } = makeMemoryStore();
    let reserveCalls = 0;
    let openAiCalled = false;
    const spyStore: AiUsageStore = {
      reserve: (...args) => {
        reserveCalls++;
        return store.reserve(...args);
      },
      finalize: (...args) => store.finalize(...args),
    };
    __setAiUsageStoreForTest(spyStore);

    const saved = process.env[AI_KEY_ENV];
    delete process.env[AI_KEY_ENV];
    try {
      await assert.rejects(
        withAiUsage({ userId: "u1", familyId: "fam-1", feature: "insights" }, async () => {
          openAiCalled = true;
          return {};
        }),
        (err: unknown) => err instanceof AiError && err.code === "AI_NOT_CONFIGURED",
      );
      assert.equal(reserveCalls, 0, "lo store non deve essere toccato senza chiave");
      assert.equal(rows.length, 0, "nessun record ai_usage creato senza chiave");
      assert.equal(openAiCalled, false, "OpenAI non deve essere chiamato senza chiave");
    } finally {
      if (saved === undefined) delete process.env[AI_KEY_ENV];
      else process.env[AI_KEY_ENV] = saved;
    }
  });

  test("chiave presente ma provider 401/403 -> record creato e finalizzato 'failed'", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    // mapOpenAiError({status:401}) -> AiError. Con chiave PRESENTE la reserve
    // avviene (OpenAI è stato realmente chiamato), quindi il record va a 'failed'.
    await assert.rejects(
      withAiUsage({ userId: "u1", familyId: "fam-1", feature: "insights" }, async () => {
        throw mapOpenAiError({ status: 401 });
      }),
      (err: unknown) => err instanceof AiError,
    );
    assert.equal(rows.length, 1, "il provider è stato chiamato: il tentativo è registrato");
    assert.equal(rows[0]!.status, "failed");
  });

  test("OpenAI risposta malformata (AI_BAD_RESPONSE) -> usage 'failed' e rilancia", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    let openAiCalled = false;
    await assert.rejects(
      withAiUsage({ userId: "u1", familyId: "fam-1", feature: "recipe-suggestions" }, async () => {
        openAiCalled = true;
        throw new AiError("AI_BAD_RESPONSE", "JSON malformato");
      }),
      (err: unknown) => err instanceof AiError && err.code === "AI_BAD_RESPONSE",
    );
    assert.equal(openAiCalled, true, "OpenAI è stato chiamato (quindi consuma quota)");
    assert.equal(rows.length, 1, "il tentativo è registrato anche se fallito");
    assert.equal(rows[0]!.status, "failed");
  });

  test("OpenAI timeout/provider error -> usage 'failed'", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    for (const code of ["AI_TIMEOUT", "AI_PROVIDER_ERROR"] as const) {
      await assert.rejects(
        withAiUsage({ userId: "u1", familyId: "fam-T", feature: "weekly-meal-plan" }, async () => {
          throw new AiError(code, "boom");
        }),
        (err: unknown) => err instanceof AiError && err.code === code,
      );
    }
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.status === "failed"));
  });

  test("quota piena -> outcome 'limited', OpenAI NON chiamato", async () => {
    const { store } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    for (let i = 0; i < 3; i++) await reserveAiSlot("u1", "fam-1", "weekly-meal-plan");
    let openAiCalled = false;
    const run = await withAiUsage(
      { userId: "u1", familyId: "fam-1", feature: "weekly-meal-plan" },
      async () => {
        openAiCalled = true;
        return {};
      },
    );
    assert.equal(run.outcome, "limited");
    assert.equal(openAiCalled, false, "OpenAI non deve essere chiamato a quota piena");
  });

  test("quota non verificabile (DB giù) -> outcome 'unavailable', OpenAI NON chiamato", async () => {
    const failingStore: AiUsageStore = {
      async reserve() {
        return { status: "unavailable" };
      },
      async finalize() {},
    };
    __setAiUsageStoreForTest(failingStore);
    let openAiCalled = false;
    const run = await withAiUsage(
      { userId: "u1", familyId: "fam-1", feature: "insights" },
      async () => {
        openAiCalled = true;
        return {};
      },
    );
    assert.equal(run.outcome, "unavailable");
    assert.equal(openAiCalled, false);
  });
});

describe("concorrenza: quota vicina al limite non viene superata", () => {
  test("12 richieste concorrenti, max 3 -> esattamente 3 'ok', nessun overshoot", async () => {
    const { store, rows } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, () => reserveAiSlot("u1", "fam-1", "weekly-meal-plan")),
    );
    const ok = results.filter((r) => r.status === "ok").length;
    const limited = results.filter((r) => r.status === "limited").length;
    assert.equal(ok, 3, "solo 3 slot concessi anche con richieste concorrenti");
    assert.equal(limited, N - 3);
    assert.equal(rows.length, 3, "solo 3 record creati nel DB simulato");
  });

  test("shopping concorrente: max 10 non viene superato", async () => {
    const { store } = makeMemoryStore();
    __setAiUsageStoreForTest(store);
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, () => reserveAiSlot("u1", "fam-1", "shopping-suggestions")),
    );
    const ok = results.filter((r) => r.status === "ok").length;
    assert.equal(ok, 10);
  });
});
