-- GDPR: il consenso AI deve essere opt-in a livello di database.
-- Cambia solo il DEFAULT per i nuovi utenti; i valori esistenti
-- (scelti esplicitamente dagli utenti) NON vengono toccati.
ALTER TABLE "users" ALTER COLUMN "ai_features_enabled" SET DEFAULT false;
