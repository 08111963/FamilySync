import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users, families, aiUsage } from "../../shared/schema";
import { reserveAiSlot, finalizeAiUsage, __resetAiUsageStoreForTest } from "../lib/ai-usage";

/**
 * Test di INTEGRAZIONE contro il DB reale: verifica che la prenotazione atomica
 * (transazione + pg_advisory_xact_lock) NON superi il limite anche con molte
 * richieste concorrenti. Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("ai_usage concorrenza reale (DB)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let userId: string;
  let familyId: string;

  before(async () => {
    // reserveAiSlot richiede la chiave OpenAI presente (assertAiConfigured).
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-openai-key";
    }
    __resetAiUsageStoreForTest();
    const [u] = await db
      .insert(users)
      .values({
        email: `ai-usage-test-${Date.now()}@example.com`,
        passwordHash: "x",
        name: "AI Usage Test",
      })
      .returning({ id: users.id });
    userId = u!.id;
    const [f] = await db.insert(families).values({ name: "AI Usage Test Family" }).returning({ id: families.id });
    familyId = f!.id;
  });

  after(async () => {
    // cascade: cancellare la famiglia/utente rimuove le righe ai_usage collegate
    if (familyId) await db.delete(families).where(eq(families.id, familyId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  test("16 richieste concorrenti su weekly-meal-plan (max 3) -> esattamente 3 'ok'", async () => {
    const N = 16;
    const results = await Promise.all(
      Array.from({ length: N }, () => reserveAiSlot(userId, familyId, "weekly-meal-plan")),
    );
    const ok = results.filter((r) => r.status === "ok");
    const limited = results.filter((r) => r.status === "limited");

    assert.equal(ok.length, 3, "solo 3 slot concessi sotto carico concorrente");
    assert.equal(limited.length, N - 3);

    // Verifica diretta sul DB: esattamente 3 righe per questa famiglia/feature.
    const rows = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.familyId, familyId), eq(aiUsage.feature, "weekly-meal-plan")));
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.status === "started"));

    // finalize aggiorna lo stato
    await finalizeAiUsage(ok[0]!.status === "ok" ? ok[0]!.usageId : "", true);
    const refreshed = await db
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.familyId, familyId), eq(aiUsage.feature, "weekly-meal-plan")));
    assert.equal(refreshed.filter((r) => r.status === "succeeded").length, 1);
  });
});
