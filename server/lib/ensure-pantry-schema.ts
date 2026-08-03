import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Garantisce in modo idempotente l'indice univoco della dispensa
 * (family_id, normalized_name, COALESCE(unit,'')) richiesto dall'upsert
 * ON CONFLICT di addToPantry.
 *
 * Perché serve: l'indice usa un'espressione (COALESCE) che drizzle-kit push
 * non sa riprodurre, quindi il Republish sincronizza tabelle e colonne ma
 * NON questo indice. Senza indice, in produzione ogni "spunta acquisto"
 * falliva con "no unique or exclusion constraint matching the ON CONFLICT
 * specification" e la dispensa restava vuota.
 *
 * Prima di creare l'indice, unisce eventuali righe duplicate preesistenti
 * (stessa chiave): somma le quantità e tiene la scadenza più vicina,
 * come nella migrazione 0010.
 */
export async function ensurePantryUniqueIndex(): Promise<{ created: boolean }> {
  const existing = await db.execute(sql`
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'pantry_items' AND indexname = 'pantry_items_family_norm_unit_uq'
  `);
  if ((existing as any).rows?.length > 0) return { created: false };

  let created = false;
  await db.transaction(async (tx) => {
    // Serializza il bootstrap DDL tra istanze parallele (autoscale/reusePort):
    // lock advisory a livello di transazione, rilasciato al commit.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('pantry_items_family_norm_unit_uq'))`);
    // Un'altra istanza potrebbe aver già creato l'indice mentre aspettavamo il lock.
    const recheck = await tx.execute(sql`
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'pantry_items' AND indexname = 'pantry_items_family_norm_unit_uq'
    `);
    if ((recheck as any).rows?.length > 0) return;
    // Dedup preesistente (come migrations/0010): somma quantità sul più vecchio…
    await tx.execute(sql`
      WITH ranked AS (
        SELECT id, family_id, normalized_name, COALESCE(unit, '') AS unit_key,
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
        AND ranked.unit_key = agg.unit_key
    `);
    // …ed elimina i doppioni successivi.
    await tx.execute(sql`
      DELETE FROM pantry_items pi
      USING (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY family_id, normalized_name, COALESCE(unit, '') ORDER BY created_at ASC) AS rn
        FROM pantry_items
      ) d
      WHERE pi.id = d.id AND d.rn > 1
    `);
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "pantry_items_family_norm_unit_uq"
        ON "pantry_items" ("family_id", "normalized_name", COALESCE("unit", ''))
    `);
    created = true;
  });
  return { created };
}
