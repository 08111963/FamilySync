-- Stato condiviso del ciclo di alert sulla latenza dei piani pasti.
-- Non contiene famiglia, utente, piano, ingredienti, preferenze o dati salute:
-- solo contatori operativi per modalità, necessari a coordinare le istanze.
CREATE TABLE IF NOT EXISTS "meal_plan_latency_alert_state" (
  "mode" varchar(16) PRIMARY KEY,
  "consecutive_over_duration_budget" integer NOT NULL DEFAULT 0,
  "consecutive_over_model_call_budget" integer NOT NULL DEFAULT 0,
  "episode_active" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp NOT NULL DEFAULT now()
);