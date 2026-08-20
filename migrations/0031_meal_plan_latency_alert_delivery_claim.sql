-- Consegna idempotente dell'alert: se l'email fallisce, il claim viene
-- rilasciato e un campione lento successivo può ritentare. Nessun dato utente.
ALTER TABLE "meal_plan_latency_alert_state"
  ADD COLUMN IF NOT EXISTS "notification_delivered" boolean NOT NULL DEFAULT false;
ALTER TABLE "meal_plan_latency_alert_state"
  ADD COLUMN IF NOT EXISTS "notification_claim_id" varchar(36);
ALTER TABLE "meal_plan_latency_alert_state"
  ADD COLUMN IF NOT EXISTS "notification_claimed_at" timestamp;