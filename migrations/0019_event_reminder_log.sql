-- Promemoria email/push per gli eventi del calendario (dedup con claim atomico)
CREATE TABLE IF NOT EXISTS "event_reminder_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "calendar_events"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "event_reminder_log_unique" UNIQUE ("event_id", "kind")
);
