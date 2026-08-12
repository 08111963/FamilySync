-- Dedup del callback OAuth Google: alcuni browser mobile richiamano il
-- callback due volte con lo stesso authorization code; la seconda richiesta
-- deve essere reindirizzata al risultato della prima invece di fallire.
CREATE TABLE IF NOT EXISTS "oauth_callback_results" (
  "code_hash" varchar(64) PRIMARY KEY,
  "redirect_url" text NOT NULL,
  "expires_at" timestamp NOT NULL
);
