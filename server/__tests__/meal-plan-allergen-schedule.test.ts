import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';

process.env.AI_INTEGRATIONS_OPENAI_API_KEY =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'test-key';

import { db } from '../db';
import {
  ALLERGEN_MONITOR_JOB_NAME,
  claimWeeklyAllergenMonitorRun,
} from '../lib/meal-plan-allergen-monitor';

async function resetJob(): Promise<void> {
  await db.execute(
    sql`DELETE FROM scheduled_job_runs WHERE job_name = ${ALLERGEN_MONITOR_JOB_NAME}`,
  );
}

after(resetJob);

test('claim allergeni: una sola istanza ottiene il budget settimanale', async () => {
  await resetJob();
  const claims = await Promise.all(
    Array.from({ length: 5 }, () => claimWeeklyAllergenMonitorRun()),
  );
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await claimWeeklyAllergenMonitorRun(), false);
});

test('claim allergeni: il budget torna disponibile solo dopo una settimana', async () => {
  await resetJob();
  const start = new Date('2026-08-03T10:00:00.000Z');
  assert.equal(await claimWeeklyAllergenMonitorRun(start), true);
  assert.equal(
    await claimWeeklyAllergenMonitorRun(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)),
    false,
  );
  assert.equal(
    await claimWeeklyAllergenMonitorRun(new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000)),
    true,
  );
});