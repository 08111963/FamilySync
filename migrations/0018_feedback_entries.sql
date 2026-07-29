-- Feedback tester ("Dacci il tuo parere"): bug, suggerimenti e valutazione a stelle.
CREATE TABLE IF NOT EXISTS "feedback_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" varchar(20) NOT NULL,
  "rating" integer,
  "message" text NOT NULL,
  "platform" varchar(10),
  "app_version" varchar(20),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "feedback_entries_created_idx" ON "feedback_entries" ("created_at");
CREATE INDEX IF NOT EXISTS "feedback_entries_user_idx" ON "feedback_entries" ("user_id");
