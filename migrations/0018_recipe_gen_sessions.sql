-- Sessioni della generazione incrementale ricette: persistite su DB così il
-- polling sopravvive a riavvii del backend e a deploy multi-istanza.
CREATE TABLE IF NOT EXISTS "recipe_gen_sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "family_id" uuid NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "recipes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "done" boolean NOT NULL DEFAULT false,
  "error_status" integer,
  "error_body" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "recipe_gen_sessions_created_idx" ON "recipe_gen_sessions" ("created_at");
