-- Vincolo di integrità sugli orari degli eventi calendario.
-- Prima BONIFICA le righe storiche malformate (stessa logica di
-- normalizeTimeOfDay/normalize-event-times), poi aggiunge i CHECK: così la
-- migrazione è ripetibile e non fallisce mai per dati preesistenti.

-- 1) Bonifica time: valori recuperabili ("15", "9:30", "15.30") → "HH:MM",
--    irrecuperabili → NULL (l'evento ricade nel percorso all-day).
UPDATE "calendar_events" AS ce
SET "time" = sub.norm
FROM (
  SELECT id,
    CASE
      WHEN m IS NULL THEN NULL
      WHEN (m[1])::int > 23 OR COALESCE((m[2])::int, 0) > 59 THEN NULL
      ELSE lpad(m[1], 2, '0') || ':' || lpad(COALESCE(m[2], '0'), 2, '0')
    END AS norm
  FROM (
    SELECT id, regexp_match(btrim("time"), '^(\d{1,2})(?:[:.](\d{1,2})(?::\d{1,2})?)?$') AS m
    FROM "calendar_events"
    WHERE "time" IS NOT NULL
      AND "time" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) s
) sub
WHERE ce.id = sub.id;

-- 2) Bonifica end_time con la stessa regola.
UPDATE "calendar_events" AS ce
SET "end_time" = sub.norm
FROM (
  SELECT id,
    CASE
      WHEN m IS NULL THEN NULL
      WHEN (m[1])::int > 23 OR COALESCE((m[2])::int, 0) > 59 THEN NULL
      ELSE lpad(m[1], 2, '0') || ':' || lpad(COALESCE(m[2], '0'), 2, '0')
    END AS norm
  FROM (
    SELECT id, regexp_match(btrim("end_time"), '^(\d{1,2})(?:[:.](\d{1,2})(?::\d{1,2})?)?$') AS m
    FROM "calendar_events"
    WHERE "end_time" IS NOT NULL
      AND "end_time" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) s
) sub
WHERE ce.id = sub.id;

-- 3) Senza orario di inizio l'end_time da solo non ha senso.
UPDATE "calendar_events" SET "end_time" = NULL WHERE "time" IS NULL AND "end_time" IS NOT NULL;

-- 4) CHECK: da qui in poi time/end_time sono sempre NULL oppure "HH:MM".
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_time_format_check";
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_time_format_check"
  CHECK ("time" IS NULL OR "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_end_time_format_check";
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_end_time_format_check"
  CHECK ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
