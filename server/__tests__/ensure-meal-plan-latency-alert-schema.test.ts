/**
 * Verifica il bootstrap della tabella di stato alert: un DB pubblicato può
 * partire senza la migration 0030, quindi l'avvio deve crearla in modo
 * idempotente e sicuro anche se più istanze arrivano insieme.
 *
 * Run: npx tsx server/__tests__/ensure-meal-plan-latency-alert-schema.test.ts
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { ensureMealPlanLatencyAlertSchema } from '../lib/ensure-meal-plan-latency-alert-schema';

async function tableExists(): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT to_regclass('public.meal_plan_latency_alert_state') AS t`,
  );
  return Boolean((result as any).rows?.[0]?.t);
}

afterEach(async () => {
  await ensureMealPlanLatencyAlertSchema();
});

test('rende disponibile la tabella mancante anche con bootstrap concorrenti', async () => {
  // La tabella conserva solo contatori operativi della suite di test, nessun
  // dato utente. La rimuoviamo temporaneamente per simulare il primo deploy.
  await db.execute(sql`DROP TABLE IF EXISTS "meal_plan_latency_alert_state"`);
  assert.equal(await tableExists(), false);

  const results = await Promise.all([
    ensureMealPlanLatencyAlertSchema(),
    ensureMealPlanLatencyAlertSchema(),
  ]);
  assert.ok(
    results.some((result) => result.created),
    'almeno un bootstrap deve rilevare e creare la tabella assente',
  );
  assert.equal(await tableExists(), true);
  assert.deepEqual(await ensureMealPlanLatencyAlertSchema(), { created: false });
});