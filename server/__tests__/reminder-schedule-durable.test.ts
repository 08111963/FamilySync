import { test, after } from "node:test";
import assert from "node:assert/strict";

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimScheduledJobRun,
  releaseScheduledJobRun,
} from "../lib/scheduled-jobs";
import { BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS } from "../lib/bill-reminders";
import { EVENT_REMINDERS_JOB_NAME, EVENT_REMINDERS_MIN_INTERVAL_MS } from "../lib/event-reminders";

/**
 * Verifica la schedulazione DUREVOLE dei promemoria bollette/eventi:
 * last-run persistito in scheduled_job_runs con claim atomico, così il giro
 * orario parte anche se le istanze autoscale si riavviano di continuo, e con
 * più istanze concorrenti una sola vince il claim (il dedup anti-doppio-invio
 * per singola bolletta/evento resta su bill_reminder_log/event_reminder_log).
 */

const JOBS = [BILL_REMINDERS_JOB_NAME, EVENT_REMINDERS_JOB_NAME];

async function resetJobRows(): Promise<void> {
  for (const job of JOBS) {
    await db.execute(sql`DELETE FROM scheduled_job_runs WHERE job_name = ${job}`);
  }
}

async function backdateJobRow(jobName: string, ms: number): Promise<void> {
  await db.execute(sql`
    UPDATE scheduled_job_runs
    SET last_run_at = last_run_at - make_interval(secs => ${ms / 1000})
    WHERE job_name = ${jobName}
  `);
}

after(async () => {
  await resetJobRows();
});

test("primo claim in assoluto riesce per entrambi i job", async () => {
  await resetJobRows();
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  assert.equal(await claimScheduledJobRun(EVENT_REMINDERS_JOB_NAME, EVENT_REMINDERS_MIN_INTERVAL_MS), true);
});

test("riavvio subito dopo un run: il claim viene rifiutato (stato su DB, non in-process)", async () => {
  await resetJobRows();
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  // Simula un riavvio dell'istanza: nessuno stato in memoria, il DB decide.
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), false);
});

test("istanza spenta oltre la finestra: al boot successivo il claim riesce (catch-up)", async () => {
  await resetJobRows();
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  // Non ancora passata la finestra: rifiutato.
  await backdateJobRow(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS / 2);
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), false);
  // Oltre la finestra (istanza rimasta spenta a lungo): accettato.
  await backdateJobRow(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS);
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  // E subito dopo torna a essere rifiutato.
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), false);
});

test("claim concorrenti (più istanze autoscale): una sola vince", async () => {
  await resetJobRows();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      claimScheduledJobRun(EVENT_REMINDERS_JOB_NAME, EVENT_REMINDERS_MIN_INTERVAL_MS)
    )
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test("release dopo un run fallito: il claim torna subito disponibile", async () => {
  await resetJobRows();
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), false);
  await releaseScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS);
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
});

test("i due job sono indipendenti: il claim di uno non blocca l'altro", async () => {
  await resetJobRows();
  assert.equal(await claimScheduledJobRun(BILL_REMINDERS_JOB_NAME, BILL_REMINDERS_MIN_INTERVAL_MS), true);
  assert.equal(await claimScheduledJobRun(EVENT_REMINDERS_JOB_NAME, EVENT_REMINDERS_MIN_INTERVAL_MS), true);
});
