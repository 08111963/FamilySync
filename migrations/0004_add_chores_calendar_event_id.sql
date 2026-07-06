-- Faccende sincronizzate col calendario: evento collegato (come le bollette).
ALTER TABLE "chores"
  ADD COLUMN IF NOT EXISTS "calendar_event_id" uuid
  REFERENCES "calendar_events"("id") ON DELETE SET NULL;
