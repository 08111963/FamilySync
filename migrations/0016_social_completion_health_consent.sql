-- GDPR: completamento registrazione social, consenso salute separato,
-- presa visione della Privacy Policy come informativa (non consenso).

-- 1) Consenso specifico per allergie/intolleranze inviate all'AI (opt-in).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_health_consent" boolean NOT NULL DEFAULT false;

-- 2) Versione della Privacy Policy di cui l'utente ha preso visione.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "privacy_policy_seen_version" varchar(20);

-- 3) Nuovo tipo di consenso nel registro.
ALTER TYPE "consent_type" ADD VALUE IF NOT EXISTS 'ai_health';

-- 4) Registrazioni social in sospeso (token monouso, solo hash).
CREATE TABLE IF NOT EXISTS "social_signup_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "provider" varchar(20) NOT NULL,
  "email" varchar(255) NOT NULL,
  "suggested_name" varchar(100),
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
