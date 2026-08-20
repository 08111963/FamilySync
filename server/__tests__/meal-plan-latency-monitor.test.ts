import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEAL_PLAN_LATENCY_ALERT_STREAK,
  MEAL_PLAN_LATENCY_BUDGETS,
  recordMealPlanLatency,
  resetMealPlanLatencyMonitorForTest,
} from '../lib/meal-plan-latency-monitor';

afterEach(() => {
  resetMealPlanLatencyMonitorForTest();
});

test('separa gli aggregati standard e vincolati e conserva solo metriche numeriche', () => {
  const standard = recordMealPlanLatency({
    mode: 'standard',
    durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
    modelCalls: 2,
  });
  const constrained = recordMealPlanLatency({
    mode: 'constrained',
    durationMs: 12_000,
    modelCalls: MEAL_PLAN_LATENCY_BUDGETS.constrained.modelCalls,
  });

  assert.equal(standard?.mode, 'standard');
  assert.equal(standard?.sampleCount, 1);
  assert.equal(standard?.signal, null);
  assert.equal(constrained?.mode, 'constrained');
  assert.equal(constrained?.sampleCount, 1);
  assert.equal(constrained?.signal, null);
  assert.equal(constrained?.averageModelCalls, 3);
  assert.ok(!Object.keys(standard ?? {}).some((key) => /title|ingredient|preference|note|family/i.test(key)));
});

test('segnala solo un aumento sostenuto della durata o delle chiamate', () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK - 1; i++) {
    const snapshot = recordMealPlanLatency({
      mode: 'standard',
      durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
      modelCalls: 1,
    });
    assert.equal(snapshot?.signal, null);
  }

  const durationSignal = recordMealPlanLatency({
    mode: 'standard',
    durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
    modelCalls: 1,
  });
  assert.equal(durationSignal?.signal, 'duration');
  assert.equal(durationSignal?.sustainedDurationRegression, true);
  assert.equal(durationSignal?.sustainedModelCallRegression, false);

  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK; i++) {
    const snapshot = recordMealPlanLatency({
      mode: 'standard',
      durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
      modelCalls: MEAL_PLAN_LATENCY_BUDGETS.standard.modelCalls + 1,
    });
    if (i === MEAL_PLAN_LATENCY_ALERT_STREAK - 1) {
      assert.equal(snapshot?.signal, 'duration_and_model_calls');
    }
  }
  assert.equal(warnings.length, 2, 'durata e chiamate hanno segnali operativi distinti');
  assert.match(warnings[0]!, /"signal":"duration"/);
  assert.match(warnings[1]!, /"signal":"duration_and_model_calls"/);
  assert.ok(warnings.every((line) => !/titolo|ingrediente|allerg|famiglia/i.test(line)));
  } finally {
    console.warn = originalWarn;
  }
});

test('input non valido non altera il monitor', () => {
  assert.equal(recordMealPlanLatency({
    mode: 'standard',
    durationMs: -1,
    modelCalls: 1,
  }), null);
  assert.equal(recordMealPlanLatency({
    mode: 'standard',
    durationMs: 100,
    modelCalls: 1.5,
  }), null);
  const valid = recordMealPlanLatency({
    mode: 'standard',
    durationMs: 100,
    modelCalls: 1,
  });
  assert.equal(valid?.sampleCount, 1);
});

test('quattro pasti al giorno non vengono classificati come regressione di chiamate', () => {
  for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK; i++) {
    const snapshot = recordMealPlanLatency({
      mode: 'constrained',
      durationMs: 1_000,
      modelCalls: 4,
      modelCallBudget: 4,
    });
    assert.equal(snapshot?.signal, null);
    assert.deepEqual(snapshot?.observedModelCallBudgets, [4]);
  }
});