-- Orario facoltativo di scadenza per le faccende ("HH:MM").
-- Se impostato, l'evento calendario collegato ha quell'orario e quindi
-- arriva anche il promemoria Google Calendar 1 ora prima.
ALTER TABLE "chores" ADD COLUMN IF NOT EXISTS "due_time" varchar(5);

ALTER TABLE "chores" DROP CONSTRAINT IF EXISTS "chores_due_time_format_check";
ALTER TABLE "chores" ADD CONSTRAINT "chores_due_time_format_check"
  CHECK ("due_time" IS NULL OR "due_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- L'orario ha senso solo insieme alla scadenza.
UPDATE "chores" SET "due_time" = NULL WHERE "due_time" IS NOT NULL AND "due_date" IS NULL;
ALTER TABLE "chores" DROP CONSTRAINT IF EXISTS "chores_due_time_requires_date_check";
ALTER TABLE "chores" ADD CONSTRAINT "chores_due_time_requires_date_check"
  CHECK ("due_time" IS NULL OR "due_date" IS NOT NULL);
