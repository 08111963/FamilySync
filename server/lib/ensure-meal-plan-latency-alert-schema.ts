import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Garantisce in modo idempotente la tabella dello stato operativo degli alert
 * di latenza (migrazioni 0030 e 0031).
 *
 * Il database pubblicato può essere separato da quello di sviluppo e non
 * ricevere subito la nuova migrazione. Senza tabella il monitor fail-closed per
 * evitare doppioni, ma non riuscirebbe a notificare la regressione: il
 * bootstrap all'avvio rende quindi il canale operativo disponibile prima di
 * accettare richieste.
 */
export async function ensureMealPlanLatencyAlertSchema(): Promise<{ created: boolean }> {
  const existing = await db.execute(
    sql`SELECT to_regclass('public.meal_plan_latency_alert_state') AS t`,
  );
  const tableAlreadyExisted = Boolean((existing as any).rows?.[0]?.t);
  let created = false;
  await db.transaction(async (tx) => {
    // Più istanze autoscale possono avviarsi insieme: il lock serializza il
    // controllo e il CREATE, poi viene rilasciato automaticamente al commit.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('meal_plan_latency_alert_state_ddl'))`,
    );
    const recheck = await tx.execute(
      sql`SELECT to_regclass('public.meal_plan_latency_alert_state') AS t`,
    );
    if (!(recheck as any).rows?.[0]?.t) {
      // DDL base identico a migrations/0030_meal_plan_latency_alert_state.sql.
      await tx.execute(sql`
        CREATE TABLE IF NOT EXISTS "meal_plan_latency_alert_state" (
          "mode" varchar(16) PRIMARY KEY,
          "consecutive_over_duration_budget" integer NOT NULL DEFAULT 0,
          "consecutive_over_model_call_budget" integer NOT NULL DEFAULT 0,
          "episode_active" boolean NOT NULL DEFAULT false,
          "notification_delivered" boolean NOT NULL DEFAULT false,
          "notification_claim_id" varchar(36),
          "notification_claimed_at" timestamp,
          "updated_at" timestamp NOT NULL DEFAULT now()
        )
      `);
      created = true;
    }
    // Un deploy precedente può aver creato la tabella con la prima versione
    // (0030): aggiorniamo idempotentemente le sole colonne operative 0031.
    await tx.execute(sql`
      ALTER TABLE "meal_plan_latency_alert_state"
        ADD COLUMN IF NOT EXISTS "notification_delivered" boolean NOT NULL DEFAULT false
    `);
    await tx.execute(sql`
      ALTER TABLE "meal_plan_latency_alert_state"
        ADD COLUMN IF NOT EXISTS "notification_claim_id" varchar(36)
    `);
    await tx.execute(sql`
      ALTER TABLE "meal_plan_latency_alert_state"
        ADD COLUMN IF NOT EXISTS "notification_claimed_at" timestamp
    `);
  });
  return { created: created || !tableAlreadyExisted };
}