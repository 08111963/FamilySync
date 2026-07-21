-- Dedup preesistente: unisce righe con stesso (family_id, normalized_name, unit)
-- sommando le quantità e tenendo la scadenza più vicina.
WITH ranked AS (
  SELECT id,
         family_id, normalized_name, COALESCE(unit, '') AS unit_key,
         ROW_NUMBER() OVER (PARTITION BY family_id, normalized_name, COALESCE(unit, '') ORDER BY created_at ASC) AS rn
  FROM pantry_items
),
agg AS (
  SELECT p.family_id, p.normalized_name, COALESCE(p.unit, '') AS unit_key,
         CASE WHEN bool_and(p.quantity IS NULL) THEN NULL ELSE SUM(COALESCE(p.quantity, 0)) END AS total_qty,
         MIN(p.expiry_date) AS min_expiry
  FROM pantry_items p
  GROUP BY p.family_id, p.normalized_name, COALESCE(p.unit, '')
  HAVING COUNT(*) > 1
)
UPDATE pantry_items pi
SET quantity = agg.total_qty,
    expiry_date = agg.min_expiry,
    updated_at = now()
FROM ranked, agg
WHERE pi.id = ranked.id AND ranked.rn = 1
  AND ranked.family_id = agg.family_id
  AND ranked.normalized_name = agg.normalized_name
  AND ranked.unit_key = agg.unit_key;

DELETE FROM pantry_items pi
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY family_id, normalized_name, COALESCE(unit, '') ORDER BY created_at ASC) AS rn
  FROM pantry_items
) d
WHERE pi.id = d.id AND d.rn > 1;

-- Vincolo univoco per upsert atomico (unit NULL trattata come stringa vuota).
CREATE UNIQUE INDEX IF NOT EXISTS "pantry_items_family_norm_unit_uq"
  ON "pantry_items" ("family_id", "normalized_name", COALESCE("unit", ''));
