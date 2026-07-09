-- Migration: aggiunge bills.custom_reminder_dates per le date promemoria personalizzate delle bollette.
-- Contiene un array JSON di date ISO (AAAA-MM-GG) scelte dall'utente, oltre agli avvisi automatici.
-- Sicura e idempotente per la produzione: puo essere eseguita piu volte senza errori.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "custom_reminder_dates" jsonb NOT NULL DEFAULT '[]'::jsonb;
