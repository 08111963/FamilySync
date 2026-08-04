-- Sicurezza autenticazione e token (task hardening):
-- 1) token_version su users: incrementata a ogni cambio/reset password per
--    invalidare tutti i refresh token emessi prima (revoca sessioni rubate).
-- 2) consumed_oauth_codes: registro condiviso (DB) dei loginCode OAuth già
--    consumati, perché su autoscale la mappa in-memory per-istanza non
--    impedisce il replay su un'istanza diversa.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "consumed_oauth_codes" (
  "jti" varchar(64) PRIMARY KEY,
  "expires_at" timestamp NOT NULL
);
