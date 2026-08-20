/**
 * Il ciclo dell'alert di latenza deve essere condiviso tra istanze. Questi test
 * usano il DB di sviluppo perché un Map in-memory non coprirebbe riavvii o
 * autoscale.
 *
 * Run: npx tsx server/__tests__/meal-plan-latency-alert-state.test.ts
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEAL_PLAN_LATENCY_ALERT_STREAK,
  recordMealPlanLatency,
  recordMealPlanLatencyDurableState,
  resetMealPlanLatencyMonitorForTest,
  resetMealPlanLatencyDurableStateForTest,
  setMealPlanLatencyNotifierForTest,
} from '../lib/meal-plan-latency-monitor';

afterEach(async () => {
  resetMealPlanLatencyMonitorForTest();
  await resetMealPlanLatencyDurableStateForTest();
});

const overDuration = {
  mode: 'standard' as const,
  overDurationBudget: true,
  overModelCallBudget: false,
};

test('apre una sola volta un episodio condiviso e lo riapre solo dopo il recupero', async () => {
  await resetMealPlanLatencyDurableStateForTest();
  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK - 1; i++) {
    assert.equal((await recordMealPlanLatencyDurableState(overDuration)).lifecycle, null);
  }
  assert.equal((await recordMealPlanLatencyDurableState(overDuration)).lifecycle, 'opened');

  // Simula una seconda istanza o un riavvio: legge lo stesso cursore DB e non
  // può aprire un secondo alert mentre il primo episodio è attivo.
  assert.equal((await recordMealPlanLatencyDurableState(overDuration)).lifecycle, null);
  assert.equal((await recordMealPlanLatencyDurableState({
    mode: 'standard',
    overDurationBudget: false,
    overModelCallBudget: false,
  })).lifecycle, 'recovered');

  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK - 1; i++) {
    assert.equal((await recordMealPlanLatencyDurableState(overDuration)).lifecycle, null);
  }
  assert.equal((await recordMealPlanLatencyDurableState(overDuration)).lifecycle, 'opened');
});

test('due istanze concorrenti non possono aprire due avvisi', async () => {
  await resetMealPlanLatencyDurableStateForTest();
  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK - 1; i++) {
    await recordMealPlanLatencyDurableState(overDuration);
  }
  const results = await Promise.all([
    recordMealPlanLatencyDurableState(overDuration),
    recordMealPlanLatencyDurableState(overDuration),
  ]);
  assert.equal(results.filter((result) => result.lifecycle === 'opened').length, 1);
  assert.equal(
    results.filter((result) => result.notificationClaimId !== null).length,
    1,
    'una sola istanza deve ottenere la claim di consegna',
  );
});

test('un invio fallito rilascia la claim e il campione lento successivo ritenta', async () => {
  await resetMealPlanLatencyDurableStateForTest();
  resetMealPlanLatencyMonitorForTest();
  let attempts = 0;
  setMealPlanLatencyNotifierForTest(async () => {
    attempts++;
    if (attempts === 1) throw new Error('temporary provider failure');
    return 1;
  });

  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK; i++) {
    recordMealPlanLatency({
      mode: 'standard',
      durationMs: 30_001,
      modelCalls: 1,
    });
  }
  await waitFor(() => attempts === 1);
  // Attende anche il rilascio del claim dopo il primo invio fallito.
  await new Promise((resolve) => setTimeout(resolve, 25));

  // Due istanze ricevono contemporaneamente altri campioni lenti: una sola
  // deve acquisire la claim rilasciata e inviare il retry.
  await Promise.all([
    Promise.resolve().then(() => recordMealPlanLatency({
      mode: 'standard',
      durationMs: 30_001,
      modelCalls: 1,
    })),
    Promise.resolve().then(() => recordMealPlanLatency({
      mode: 'standard',
      durationMs: 30_001,
      modelCalls: 1,
    })),
  ]);
  await waitFor(() => attempts === 2);

  // Un ulteriore campione dello stesso episodio non può inviare una terza email.
  recordMealPlanLatency({
    mode: 'standard',
    durationMs: 30_001,
    modelCalls: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(attempts, 2);
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('condition was not met before timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}