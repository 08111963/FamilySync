-- Sincronizzazione diretta con Google Calendar (per utente, OAuth).
-- Refresh token cifrato lato server; mapping evento -> evento Google.

CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "google_email" varchar(255),
  "refresh_token_enc" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "last_error" text,
  "last_sync_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "google_calendar_event_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "calendar_events"("id") ON DELETE CASCADE,
  "google_event_id" varchar(255) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "gcal_event_links_user_event_unique" UNIQUE ("user_id", "event_id")
);

CREATE INDEX IF NOT EXISTS "gcal_event_links_event_idx" ON "google_calendar_event_links" ("event_id");
