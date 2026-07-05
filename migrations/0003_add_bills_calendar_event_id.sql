-- Migration: aggiunge bills.calendar_event_id per sincronizzare le scadenze bollette col calendario.
-- Sicura e idempotente per la produzione: puo essere eseguita piu volte senza errori.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "calendar_event_id" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_calendar_event_id_calendar_events_id_fk'
  ) THEN
    ALTER TABLE "bills"
      ADD CONSTRAINT "bills_calendar_event_id_calendar_events_id_fk"
      FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("id") ON DELETE SET NULL;
  END IF;
END $$;
