-- Finestra scorrevole persistita dei report CLIENT_CRASH: il contatore
-- dell'alert email al proprietario deve sopravvivere a riavvii e a più
-- istanze (autoscale). Contenuto già sanificato prima dell'insert.
CREATE TABLE IF NOT EXISTS "client_crash_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message" varchar(1000) NOT NULL,
  "url" varchar(500),
  "user_agent" varchar(500),
  "platform" varchar(50),
  "at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "client_crash_reports_at_idx" ON "client_crash_reports" ("at");
