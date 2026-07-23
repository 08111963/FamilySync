-- Privacy Policy v2.1: registro consensi + fascia d'età dichiarata.

CREATE TYPE "consent_type" AS ENUM ('terms', 'ai_features');

CREATE TABLE IF NOT EXISTS "consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "consent_type" "consent_type" NOT NULL,
  "granted" boolean NOT NULL,
  "policy_version" varchar(20) NOT NULL,
  "granted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "consent_records_user_idx"
  ON "consent_records" ("user_id", "consent_type", "created_at");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_band" varchar(10);
