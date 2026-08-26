-- Visibilità degli eventi: per compatibilità gli eventi esistenti restano
-- visibili a tutta la famiglia.
DO $$ BEGIN
  CREATE TYPE "event_visibility" AS ENUM ('family', 'private');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "visibility" "event_visibility" NOT NULL DEFAULT 'family';