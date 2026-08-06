import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimScheduledJobRun,
  latestWindowOpeningInRome,
} from "../lib/scheduled-jobs";

/**
 * Test di INTEGRAZIONE contro il DB reale (scheduled_job_runs): caso autoscale
 * "tick 6:51, istanza addormentata, boot 7:15". Senza il catch-up boundary il
 * claim fallirebbe (sono passati solo 24 minuti < 50); con il boundary
 * dell'apertura fascia (7:00) il giro di recupero parte subito.
 */
const hasDb = !!process.env.DATABASE_URL;
const JOB = "test_boot_catchup_job";
const MIN_INTERVAL_MS = 50 * 60 * 1000;

/** Crea un Date con ora italiana specifica di oggi (Europe/Rome). */
function romeToday(hour: number, minute: number): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value ?? "0");
  const deltaMs =
    ((hour - get("hour")) * 3600 + (minute - get("minute")) * 60 - get("second")) * 1000;
  return new Date(now.getTime() + deltaMs);
}

describe("scheduler boot catch-up (DB)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  after(async () => {
    await db.execute(sql`DELETE FROM scheduled_job_runs WHERE job_name = ${JOB}`);
  });

  test("latestWindowOpeningInRome: alle 7:15 il confine è le 7:00", () => {
    const boot = romeToday(7, 15);
    const boundary = latestWindowOpeningInRome([7, 17], boot);
    assert.ok(boundary, "fascia aperta alle 7:15");
    // Il confine deve cadere esattamente 15 minuti prima del boot.
    assert.equal(boot.getTime() - boundary!.getTime(), 15 * 60 * 1000);
  });

  test("latestWindowOpeningInRome: alle 18:30 vince la fascia delle 17", () => {
    const now = romeToday(18, 30);
    const boundary = latestWindowOpeningInRome([7, 17], now);
    assert.ok(boundary);
    assert.equal(now.getTime() - boundary!.getTime(), 90 * 60 * 1000);
  });

  test("latestWindowOpeningInRome: alle 5:00 nessuna fascia aperta", () => {
    assert.equal(latestWindowOpeningInRome([7, 17], romeToday(5, 0)), null);
  });

  test("last_run 6:51, boot 7:15: senza boundary il claim fallisce, con boundary parte", async () => {
    const lastRun = romeToday(6, 51);
    const boot = romeToday(7, 15);

    // Stato iniziale: ultimo tick alle 6:51 (prima dell'apertura fascia 7-21).
    await db.execute(sql`DELETE FROM scheduled_job_runs WHERE job_name = ${JOB}`);
    await db.execute(sql`
      INSERT INTO scheduled_job_runs (job_name, last_run_at) VALUES (${JOB}, ${lastRun})
    `);

    // Comportamento vecchio (nessun boundary): 24 minuti < 50 ⇒ niente run.
    const withoutBoundary = await claimScheduledJobRun(JOB, MIN_INTERVAL_MS, boot);
    assert.equal(withoutBoundary, false, "senza catch-up il giro delle 7 va perso");

    // Comportamento nuovo: boundary = apertura fascia (7:00) > last_run (6:51).
    const boundary = latestWindowOpeningInRome([7, 17], boot);
    const claimed = await claimScheduledJobRun(JOB, MIN_INTERVAL_MS, boot, boundary);
    assert.equal(claimed, true, "il boot alle 7:15 recupera il giro perso");

    // Dedup: una seconda istanza che parte alle 7:20 NON rifà il giro
    // (last_run ora è 7:15, dopo l'apertura fascia).
    const boot2 = romeToday(7, 20);
    const claimed2 = await claimScheduledJobRun(
      JOB, MIN_INTERVAL_MS, boot2, latestWindowOpeningInRome([7, 17], boot2),
    );
    assert.equal(claimed2, false, "nessun doppio giro dopo il recupero");
  });

  test("last_run 7:05 (dentro la fascia), boot 7:15: nessun run extra", async () => {
    await db.execute(sql`DELETE FROM scheduled_job_runs WHERE job_name = ${JOB}`);
    await db.execute(sql`
      INSERT INTO scheduled_job_runs (job_name, last_run_at) VALUES (${JOB}, ${romeToday(7, 5)})
    `);
    const boot = romeToday(7, 15);
    const claimed = await claimScheduledJobRun(
      JOB, MIN_INTERVAL_MS, boot, latestWindowOpeningInRome([7, 17], boot),
    );
    assert.equal(claimed, false, "run già avvenuto dentro la fascia corrente");
  });
});
