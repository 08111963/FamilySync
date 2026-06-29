-- Migration: aggiunge users.deleted_at per la cancellazione/anonimizzazione account.
-- Sicura e idempotente per la produzione: puo essere eseguita piu volte senza errori.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
