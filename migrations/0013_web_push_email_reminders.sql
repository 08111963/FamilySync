-- Notifiche web push (PWA) + promemoria bollette via email/push dal server
CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "web_push_subs_user_idx" ON "web_push_subscriptions" ("user_id");

CREATE TABLE IF NOT EXISTS "bill_reminder_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bill_id" uuid NOT NULL REFERENCES "bills"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "sent_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "bill_reminder_log_unique" UNIQUE ("bill_id", "kind")
);
