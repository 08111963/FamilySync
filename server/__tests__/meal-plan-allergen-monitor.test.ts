import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'test-key';

import { AiError } from '../lib/ai-errors';
import { __setOpenAiClientForTest } from '../lib/openai';
import { sendMealPlanAllergenRegressionAlertEmail } from '../lib/email';
import {
  ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS,
  ALLERGEN_MONITOR_MAX_MODEL_CALLS,
  ALLERGEN_MONITOR_DIET_PROFILE,
  isAllergenMonitorEnabled,
  runMealPlanAllergenMonitorOnce,
} from '../lib/meal-plan-allergen-monitor';

test('sentinella: usa solo il profilo chiuso sintetico e registra il primo tentativo conforme', async () => {
  const result = await runMealPlanAllergenMonitorOnce({
    generate: async (context) => {
      assert.equal(context.preferences?.dietProfile, ALLERGEN_MONITOR_DIET_PROFILE);
      assert.equal(context.preferences?.allergies, undefined);
      assert.equal(context.preferences?.mealsPerDay, 2);
      assert.equal(context.maxConstraintAttempts, ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS);
      assert.equal(context.maxModelCalls, ALLERGEN_MONITOR_MAX_MODEL_CALLS);
      assert.equal(context.suppressInternalLogs, true);
      return { title: 'Piano', items: [] };
    },
  });

  assert.deepEqual(result, {
    outcome: 'passed',
    attempts: 1,
    violationCodes: [],
  });
});

test('sentinella: un tentativo corretto viene registrato ma non allerta', async () => {
  let notifications = 0;
  const result = await runMealPlanAllergenMonitorOnce({
    generate: async (context) => {
      context.onConstraintViolation?.({ attempt: 1, violationCodes: ['gluten'] });
      return { title: 'Piano', items: [] };
    },
    notifyRegression: async () => { notifications++; },
  });

  assert.deepEqual(result, {
    outcome: 'recovered',
    attempts: 2,
    violationCodes: ['gluten'],
  });
  assert.equal(notifications, 0);
});

test('sentinella: avvisa solo dopo la regressione confermata da tutti i tentativi', async () => {
  const notifications: Array<{ attempts: number; violationCodes: string[] }> = [];
  const result = await runMealPlanAllergenMonitorOnce({
    generate: async (context) => {
      for (let attempt = 1; attempt <= ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS; attempt++) {
        context.onConstraintViolation?.({ attempt, violationCodes: ['gluten', 'gluten'] });
      }
      throw new AiError('AI_CONSTRAINT_VIOLATION');
    },
    notifyRegression: async (report) => { notifications.push(report); },
  });

  assert.deepEqual(result, {
    outcome: 'regression_confirmed',
    attempts: 2,
    violationCodes: ['gluten'],
  });
  assert.deepEqual(notifications, [{ attempts: 2, violationCodes: ['gluten'] }]);
});

test('sentinella: errori del provider non sono regressioni e non inviano alert', async () => {
  let notifications = 0;
  const result = await runMealPlanAllergenMonitorOnce({
    generate: async () => { throw new AiError('AI_TIMEOUT'); },
    notifyRegression: async () => { notifications++; },
  });

  assert.deepEqual(result, {
    outcome: 'unavailable',
    attempts: 1,
    violationCodes: [],
  });
  assert.equal(notifications, 0);
});

test('sentinella: un errore di vincolo diverso dal profilo sintetico non allerta', async () => {
  let notifications = 0;
  const result = await runMealPlanAllergenMonitorOnce({
    generate: async (context) => {
      for (let attempt = 1; attempt <= ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS; attempt++) {
        context.onConstraintViolation?.({ attempt, violationCodes: ['ingredients-missing'] });
      }
      throw new AiError('AI_CONSTRAINT_VIOLATION');
    },
    notifyRegression: async () => { notifications++; },
  });

  assert.deepEqual(result, {
    outcome: 'unavailable',
    attempts: 2,
    violationCodes: ['ingredients-missing'],
  });
  assert.equal(notifications, 0);
});

test('sentinella: resta opt-in e ha un budget massimo rigido documentato', () => {
  const previous = process.env.MEAL_PLAN_ALLERGEN_MONITOR;
  try {
    delete process.env.MEAL_PLAN_ALLERGEN_MONITOR;
    assert.equal(isAllergenMonitorEnabled(), false);
    process.env.MEAL_PLAN_ALLERGEN_MONITOR = ' TRUE ';
    assert.equal(isAllergenMonitorEnabled(), true);
    assert.equal(ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS, 2);
    assert.equal(ALLERGEN_MONITOR_MAX_MODEL_CALLS, 2);
  } finally {
    if (previous === undefined) delete process.env.MEAL_PLAN_ALLERGEN_MONITOR;
    else process.env.MEAL_PLAN_ALLERGEN_MONITOR = previous;
  }
});

test('sentinella integrata: validatore reale, due chiamate settimanali e un solo log minimale', async (t) => {
  let modelCalls = 0;
  const fakeClient = {
    chat: {
      completions: {
        create: async (request: {
          messages: Array<{ role: string; content: string }>;
          response_format: {
            json_schema: {
              schema: {
                properties: {
                  items: {
                    items: { properties: { mealType: { enum: Array<'breakfast' | 'lunch' | 'dinner'> } } };
                  };
                };
              };
            };
          };
        }) => {
          modelCalls++;
          const systemPrompt = request.messages.find((message) => message.role === 'system')?.content || '';
          const datesText = systemPrompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./)?.[1] || '';
          const dates = datesText.split(',').map((date) => date.trim()).filter(Boolean);
          const mealTypes = request.response_format.json_schema.schema.properties.items.items.properties.mealType.enum;
          const items = dates.flatMap((date) => mealTypes.map((mealType) => ({
            date,
            mealType,
            title: mealType === 'breakfast'
              ? `Colazione dolce sintetica con pane ${date}`
              : `Pasto sintetico con pane ${mealType} ${date}`,
            description: 'Ricetta sintetica completa per la sentinella.',
            ingredients: [{ name: 'Pane', quantity: '20', unit: 'g' }],
            steps: [
              'Prepara gli ingredienti indicati.',
              'Cuoci il piatto con cura.',
              'Servi il pasto caldo.',
            ],
          })));
          return {
            choices: [{
              message: { content: JSON.stringify({ items }) },
              finish_reason: 'stop',
            }],
          };
        },
      },
    },
  };
  __setOpenAiClientForTest(fakeClient);
  t.after(() => __setOpenAiClientForTest(null));

  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const emitted: Array<{ level: string; args: unknown[] }> = [];
  console.log = (...args: unknown[]) => { emitted.push({ level: 'log', args }); };
  console.info = (...args: unknown[]) => { emitted.push({ level: 'info', args }); };
  console.warn = (...args: unknown[]) => { emitted.push({ level: 'warn', args }); };
  console.error = (...args: unknown[]) => { emitted.push({ level: 'error', args }); };
  t.after(() => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  const notifications: Array<{ attempts: number; violationCodes: string[] }> = [];
  const result = await runMealPlanAllergenMonitorOnce({
    notifyRegression: async (report) => { notifications.push(report); },
  });

  assert.deepEqual(result, {
    outcome: 'regression_confirmed',
    attempts: 2,
    violationCodes: ['gluten'],
  });
  assert.equal(modelCalls, ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS);
  assert.ok(modelCalls <= ALLERGEN_MONITOR_MAX_MODEL_CALLS);
  assert.deepEqual(notifications, [{ attempts: 2, violationCodes: ['gluten'] }]);
  assert.equal(emitted.length, 1, 'nessun log interno del generatore deve uscire');
  assert.equal(emitted[0]?.level, 'warn');
  const message = String(emitted[0]?.args[0] || '');
  const metadata = JSON.parse(message.slice(message.indexOf('{'))) as Record<string, unknown>;
  assert.deepEqual(Object.keys(metadata).sort(), [
    'attempts',
    'outcome',
    'tag',
    'violationCodes',
  ]);
  assert.deepEqual(metadata, {
    tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
    outcome: 'regression_confirmed',
    attempts: 2,
    violationCodes: ['gluten'],
  });
});

test('notifica allergeni: configurazioni email mancanti non aggiungono log', async () => {
  const previousOwners = process.env.APP_OWNER_EMAILS;
  const previousResend = process.env.RESEND_API_KEY;
  const originalLog = console.log;
  const emitted: unknown[][] = [];
  console.log = (...args: unknown[]) => { emitted.push(args); };
  try {
    delete process.env.APP_OWNER_EMAILS;
    delete process.env.RESEND_API_KEY;
    await sendMealPlanAllergenRegressionAlertEmail({
      attempts: 3,
      violationCodes: ['gluten'],
    });

    process.env.APP_OWNER_EMAILS = 'owner@test.dev';
    await sendMealPlanAllergenRegressionAlertEmail({
      attempts: 3,
      violationCodes: ['gluten'],
    });
    assert.deepEqual(emitted, []);
  } finally {
    console.log = originalLog;
    if (previousOwners === undefined) delete process.env.APP_OWNER_EMAILS;
    else process.env.APP_OWNER_EMAILS = previousOwners;
    if (previousResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResend;
  }
});