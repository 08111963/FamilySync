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

  assert.equal(MAX_MEAL_PLAN_MODEL_CALLS, 42);
  assert.match(routeSource, /MAX_MEAL_PLAN_MODEL_CALLS/);
  assert.match(standardRoute, /maxModelCalls:\s*MAX_MEAL_PLAN_MODEL_CALLS/);
  assert.match(streamRoute, /maxModelCalls:\s*MAX_MEAL_PLAN_MODEL_CALLS/);
});