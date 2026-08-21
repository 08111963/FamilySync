import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAX_MEAL_PLAN_MODEL_CALLS } from "../lib/openai";

test("le route piano pasti passano esplicitamente il budget centralizzato", () => {
  const routeSource = fs.readFileSync(path.resolve("server/routes/ai.ts"), "utf8");
  const standardRoute = routeSource.slice(
    routeSource.indexOf("router.post('/:familyId/weekly-meal-plan'"),
    routeSource.indexOf("router.post('/:familyId/weekly-meal-plan/stream'"),
  );
  const streamRoute = routeSource.slice(
    routeSource.indexOf("router.post('/:familyId/weekly-meal-plan/stream'"),
  );

  assert.equal(MAX_MEAL_PLAN_MODEL_CALLS, 28);
  assert.match(routeSource, /MAX_MEAL_PLAN_MODEL_CALLS/);
  assert.match(standardRoute, /maxModelCalls:\s*MAX_MEAL_PLAN_MODEL_CALLS/);
  assert.match(streamRoute, /maxModelCalls:\s*MAX_MEAL_PLAN_MODEL_CALLS/);
});

test("nessun chiamante applicativo avvia il Piano Pasti senza il budget centralizzato", () => {
  const routeSource = fs.readFileSync(path.resolve("server/routes/ai.ts"), "utf8");
  const applicationCallSites = [...routeSource.matchAll(/generateWeeklyMealPlan\(\{/g)];

  assert.equal(applicationCallSites.length, 2, "route standard e route streaming sono gli unici chiamanti applicativi");
  for (const callSite of applicationCallSites) {
    const callSource = routeSource.slice(callSite.index, (callSite.index || 0) + 500);
    assert.match(callSource, /maxModelCalls:\s*MAX_MEAL_PLAN_MODEL_CALLS/);
  }

  const generatorSource = fs.readFileSync(path.resolve("server/lib/openai.ts"), "utf8");
  assert.match(generatorSource, /canAffordMealPlanModelCalls\(modelCallBudget, fullAttemptCallCost\)/);
  assert.match(generatorSource, /reserveMealPlanModelCall\(context\.modelCallBudget\)/);
  assert.doesNotMatch(generatorSource, /MAX_VARIETY_GENERATION_RETRIES/);
});