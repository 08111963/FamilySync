-- Migration: aggiunge families.ics_feed_token per il feed ICS pubblico del calendario.
-- Sicura e idempotente per la produzione: puo essere eseguita piu volte senza errori.
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "ics_feed_token" varchar(64);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'families_ics_feed_token_unique'
  ) THEN
    ALTER TABLE "families" ADD CONSTRAINT "families_ics_feed_token_unique" UNIQUE ("ics_feed_token");
  END IF;
END $$;
