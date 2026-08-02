import { test, after } from "node:test";
import assert from "node:assert/strict";

// La chiave non serve per davvero (nessuna chiamata AI): serve solo perché
// il modulo importa openai.ts che richiede l'ambiente AI.
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimWeeklyBalanceRun,
  BALANCE_JOB_NAME,
} from "../lib/meal-plan-balance-monitor";

/**
 * Verifica la schedulazione DUREVOLE del run settimanale: last-run persistito
 * in scheduled_job_runs con claim atomico, così il run parte anche se le
 * istanze autoscale si riavviano di continuo e MAI due volte nella stessa
 * settimana (nemmeno con istanze concorrenti).
 */

async function resetJobRow(): Promise<void> {
  await db.execute(sql`DELETE FROM scheduled_job_runs WHERE job_name = ${BALANCE_JOB_NAME}`);
}

async function backdateJobRow(ms: number): Promise<void> {
  await db.execute(sql`
    UPDATE scheduled_job_runs
    SET last_run_at = last_run_at - make_interval(secs => ${ms / 1000})
    WHERE job_name = ${BALANCE_JOB_NAME}
  `);
}

after(async () => {
  await resetJobRow();
});

test("primo claim in assoluto riesce (nessuna riga preesistente)", async () => {
  await resetJobRow();
  assert.equal(await claimWeeklyBalanceRun(), true);
});

test("secondo claim nella stessa settimana viene rifiutato (sopravvive ai riavvii)", async () => {
  await resetJobRow();
  assert.equal(await claimWeeklyBalanceRun(), true);
  // Simula un riavvio dell'istanza: lo stato è su DB, non in-process.
  assert.equal(await claimWeeklyBalanceRun(), false);
  assert.equal(await claimWeeklyBalanceRun(new Date()), false);
});

test("dopo 7 giorni il claim riesce di nuovo", async () => {
  await resetJobRow();
  assert.equal(await claimWeeklyBalanceRun(), true);
  // Non ancora passata una settimana (6 giorni): rifiutato.
  await backdateJobRow(6 * 24 * 60 * 60 * 1000);
  assert.equal(await claimWeeklyBalanceRun(), false);
  // Oltre la settimana: accettato e last_run_at aggiornato.
  await backdateJobRow(2 * 24 * 60 * 60 * 1000);
  assert.equal(await claimWeeklyBalanceRun(), true);
  // E subito dopo torna a essere rifiutato.
  assert.equal(await claimWeeklyBalanceRun(), false);
});

test("claim concorrenti: una sola istanza vince", async () => {
  await resetJobRow();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => claimWeeklyBalanceRun())
  );
  assert.equal(results.filter(Boolean).length, 1);
});
