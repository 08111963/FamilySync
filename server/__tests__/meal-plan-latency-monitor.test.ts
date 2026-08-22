import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEAL_PLAN_LATENCY_ALERT_STREAK,
  MEAL_PLAN_LATENCY_BUDGETS,
  type MealPlanLatencyOperationalAlert,
  recordMealPlanLatency,
  resetMealPlanLatencyMonitorForTest,
  setMealPlanLatencyNotifierForTest,
  setMealPlanLatencyStateRecorderForTest,
} from '../lib/meal-plan-latency-monitor';

beforeEach(() => {
  const states = new Map<string, {
    consecutiveOverDurationBudget: number;
    consecutiveOverModelCallBudget: number;
    episodeActive: boolean;
  }>();
  setMealPlanLatencyStateRecorderForTest(async (input) => {
    const current = states.get(input.mode) ?? {
      consecutiveOverDurationBudget: 0,
      consecutiveOverModelCallBudget: 0,
      episodeActive: false,
    };
    const consecutiveOverDurationBudget = input.overDurationBudget
      ? current.consecutiveOverDurationBudget + 1
      : 0;
    const consecutiveOverModelCallBudget = input.overModelCallBudget
      ? current.consecutiveOverModelCallBudget + 1
      : 0;
    const signal =
      consecutiveOverDurationBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK &&
      consecutiveOverModelCallBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK
        ? 'duration_and_model_calls'
        : consecutiveOverDurationBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK
          ? 'duration'
          : consecutiveOverModelCallBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK
            ? 'model_calls'
            : null;
    const episodeActive = signal !== null;
    const lifecycle = !current.episodeActive && episodeActive
      ? 'opened'
      : current.episodeActive && !episodeActive
        ? 'recovered'
        : null;
    states.set(input.mode, {
      consecutiveOverDurationBudget,
      consecutiveOverModelCallBudget,
      episodeActive,
    });
    return {
      lifecycle,
      mode: input.mode,
      signal,
      consecutiveOverDurationBudget,
      consecutiveOverModelCallBudget,
      notificationClaimId: lifecycle === 'opened' ? `${input.mode}-claim` : null,
    };
  });
});

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
  assert.equal(constrained?.averageModelCalls, 2);
  assert.ok(!Object.keys(standard ?? {}).some((key) => /title|ingredient|preference|note|family/i.test(key)));
});

test('calcola p50 e p95 per preparazione, provider, parsing e validazione', () => {
  const first = recordMealPlanLatency({
    mode: 'standard',
    durationMs: 1_000,
    modelCalls: 1,
    preparationDurationMs: 20,
    providerDurationMs: 800,
    parsingDurationMs: 30,
    validationDurationMs: 150,
    responseChars: 4_000,
  });
  const second = recordMealPlanLatency({
    mode: 'standard',
    durationMs: 2_000,
    modelCalls: 1,
    preparationDurationMs: 40,
    providerDurationMs: 1_700,
    parsingDurationMs: 50,
    validationDurationMs: 210,
    responseChars: 5_000,
    repairAttempt: true,
  });

  assert.equal(first?.p50ProviderDurationMs, 800);
  assert.equal(second?.normalSampleCount, 1);
  assert.equal(second?.p50DurationMs, 1_000);
  assert.equal(second?.p95DurationMs, 1_000);
  assert.equal(second?.p50PreparationDurationMs, 20);
  assert.equal(second?.p95PreparationDurationMs, 20);
  assert.equal(second?.p50ProviderDurationMs, 800);
  assert.equal(second?.p95ProviderDurationMs, 800);
  assert.equal(second?.p50ParsingDurationMs, 30);
  assert.equal(second?.p95ParsingDurationMs, 30);
  assert.equal(second?.p50ValidationDurationMs, 150);
  assert.equal(second?.p95ValidationDurationMs, 150);
  assert.equal(second?.averageResponseChars, 4_000);
  assert.equal(second?.repairSampleCount, 1);
  assert.equal(second?.p50RepairDurationMs, 2_000);
  assert.equal(second?.p95RepairDurationMs, 2_000);
  assert.equal(second?.p50RepairPreparationDurationMs, 40);
  assert.equal(second?.p95RepairPreparationDurationMs, 40);
  assert.equal(second?.p50RepairProviderDurationMs, 1_700);
  assert.equal(second?.p95RepairProviderDurationMs, 1_700);
  assert.equal(second?.p50RepairParsingDurationMs, 50);
  assert.equal(second?.p95RepairParsingDurationMs, 50);
  assert.equal(second?.p50RepairValidationDurationMs, 210);
  assert.equal(second?.p95RepairValidationDurationMs, 210);
});

test('apre un solo episodio operativo, lo chiude al recupero e poi può riaprirlo', async () => {
  const originalError = console.error;
  const events: string[] = [];
  const notifications: MealPlanLatencyOperationalAlert[] = [];
  console.error = (...args: unknown[]) => {
    events.push(args.map((arg) => String(arg)).join(' '));
  };
  setMealPlanLatencyNotifierForTest(async (alert) => {
    notifications.push(alert);
    return 1;
  });
  try {
    for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK; i++) {
      const snapshot = recordMealPlanLatency({
        mode: 'standard',
        durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
        modelCalls: 1,
      });
      if (i === MEAL_PLAN_LATENCY_ALERT_STREAK - 1) {
        assert.equal(snapshot?.signal, 'duration');
      }
    }

    // Un secondo indicatore e ulteriori campioni appartenenti allo stesso
    // episodio aggiornano l'aggregato ma non inviano un altro avviso.
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
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(notifications.length, 1);

    const recovery = recordMealPlanLatency({
      mode: 'standard',
      durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs,
      modelCalls: MEAL_PLAN_LATENCY_BUDGETS.standard.modelCalls,
    });
    assert.equal(recovery?.signal, null);

    for (let i = 0; i < MEAL_PLAN_LATENCY_ALERT_STREAK; i++) {
      recordMealPlanLatency({
        mode: 'standard',
        durationMs: MEAL_PLAN_LATENCY_BUDGETS.standard.durationMs + 1,
        modelCalls: 1,
      });
    }
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(notifications.length, 2, 'un nuovo episodio dopo il recupero invia un nuovo avviso');
    assert.ok(
      notifications.every((notification) =>
        !Object.keys(notification).some((key) => /title|ingredient|preference|note|allerg|family|user|email/i.test(key))),
      'il payload della notifica usa soltanto metriche operative allowlist',
    );
    const opened = events.filter((line) => /"lifecycle":"opened"/.test(line));
    const recovered = events.filter((line) => /"lifecycle":"recovered"/.test(line));
    assert.equal(opened.length, 2);
    assert.equal(recovered.length, 1);
    assert.ok(events.every((line) => /"operationalChannel":"production_alerting"/.test(line)));
    assert.ok(events.every((line) => /AI_MEAL_PLAN_LATENCY_ALERT/.test(line)));
    assert.ok(events.every((line) => !/titolo|ingrediente|allerg|famiglia/i.test(line)));
  } finally {
    console.error = originalError;
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