import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { pantryItems } from '../../shared/schema';
import { eq, and, sql, asc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { getParam } from '../lib/http-params';
import { normalizeItemName } from '../lib/normalize';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';

const router = Router();

const VALID_UNITS = ['pcs', 'g', 'kg', 'ml', 'l'] as const;

/** Valida che la stringa YYYY-MM-DD sia una data reale (es. rifiuta 2026-99-99). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

const upsertItemSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(255),
  quantity: z.number().min(0).max(1000000).optional().nullable(),
  unit: z.enum(VALID_UNITS).optional().nullable(),
  category: z.string().trim().max(50).optional(),
  expiryDate: z.string()
    .refine(isRealDate, 'Data non valida (YYYY-MM-DD)')
    .optional()
    .nullable(),
});

const updateItemSchema = upsertItemSchema.partial();

/**
 * Aggiunge un prodotto in dispensa con dedup: se esiste già un item con lo
 * stesso nome normalizzato e stessa unità, somma le quantità e (se fornita)
 * aggiorna la scadenza alla più vicina. Ritorna l'item risultante.
 */
export async function addToPantry(params: {
  familyId: string;
  name: string;
  quantity?: number | string | null;
  unit?: string | null;
  category?: string | null;
  expiryDate?: string | null;
  addedBy?: string | null;
}) {
  const normalized = normalizeItemName(params.name);
  const rawQty = params.quantity != null && params.quantity !== '' ? Number(params.quantity) : null;
  const qty = rawQty != null && Number.isFinite(rawQty) ? String(rawQty) : null;
  const unit = params.unit?.trim() || null;

  // Upsert atomico sul vincolo univoco (family_id, normalized_name, COALESCE(unit,'')):
  // in conflitto somma le quantità e tiene la scadenza più vicina. Nessuna race
  // possibile tra select e insert (richieste concorrenti da più dispositivi).
  const result = await db.execute(sql`
    INSERT INTO pantry_items (family_id, name, normalized_name, quantity, unit, category, expiry_date, added_by)
    VALUES (
      ${params.familyId}, ${params.name.trim()}, ${normalized}, ${qty}::numeric, ${unit},
      ${params.category || 'food'}, ${params.expiryDate || null}::date, ${params.addedBy || null}::uuid
    )
    ON CONFLICT (family_id, normalized_name, COALESCE(unit, ''))
    DO UPDATE SET
      quantity = CASE
        WHEN EXCLUDED.quantity IS NULL THEN pantry_items.quantity
        ELSE COALESCE(pantry_items.quantity, 0) + EXCLUDED.quantity
      END,
      expiry_date = CASE
        WHEN EXCLUDED.expiry_date IS NULL THEN pantry_items.expiry_date
        WHEN pantry_items.expiry_date IS NULL THEN EXCLUDED.expiry_date
        ELSE LEAST(pantry_items.expiry_date, EXCLUDED.expiry_date)
      END,
      updated_at = now()
    RETURNING
      id, family_id AS "familyId", name, normalized_name AS "normalizedName",
      quantity, unit, category, expiry_date AS "expiryDate", added_by AS "addedBy",
      created_at AS "createdAt", updated_at AS "updatedAt",
      (xmax = 0) AS "inserted"
  `);
  const row = result.rows[0] as Record<string, unknown> & { inserted: boolean };
  const { inserted, ...item } = row;
  return { item, merged: !inserted };
}

// Lista dispensa, ordinata: prima ciò che scade prima, poi il resto per nome.
router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const items = await db
      .select()
      .from(pantryItems)
      .where(eq(pantryItems.familyId, familyId))
      .orderBy(sql`${pantryItems.expiryDate} ASC NULLS LAST`, asc(pantryItems.name));
    res.json({ items });
  } catch (error) {
    logger.error('Get pantry error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero della dispensa' } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = upsertItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const result = await addToPantry({
      familyId,
      name: parsed.data.name,
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit ?? null,
      category: parsed.data.category,
      expiryDate: parsed.data.expiryDate ?? null,
      addedBy: req.user!.userId,
    });

    broadcastToFamily(familyId, 'pantry_updated', { item: result.item });
    res.status(result.merged ? 200 : 201).json(result);
  } catch (error) {
    logger.error('Add pantry item error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiunta in dispensa" } });
  }
});

router.put('/:familyId/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const itemId = getParam(req, 'itemId');
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name.trim();
      updateData.normalizedName = normalizeItemName(parsed.data.name);
    }
    if (parsed.data.quantity !== undefined) {
      updateData.quantity = parsed.data.quantity != null ? String(parsed.data.quantity) : null;
    }
    if (parsed.data.unit !== undefined) updateData.unit = parsed.data.unit?.trim() || null;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category || 'food';
    if (parsed.data.expiryDate !== undefined) updateData.expiryDate = parsed.data.expiryDate || null;

    const [item] = await db.update(pantryItems)
      .set(updateData)
      .where(and(eq(pantryItems.id, itemId), eq(pantryItems.familyId, familyId)))
      .returning();

    if (!item) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prodotto non trovato in dispensa' } });
    }

    broadcastToFamily(familyId, 'pantry_updated', { item });
    res.json(item);
  } catch (error: any) {
    // Rinominare un prodotto in uno già presente violerebbe il vincolo univoco.
    if (error?.code === '23505') {
      return res.status(409).json({
        error: { code: 'DUPLICATE_ITEM', message: 'Esiste già un prodotto con questo nome e unità in dispensa' },
      });
    }
    logger.error('Update pantry item error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiornamento della dispensa" } });
  }
});

router.delete('/:familyId/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const itemId = getParam(req, 'itemId');

    const [deleted] = await db.delete(pantryItems)
      .where(and(eq(pantryItems.id, itemId), eq(pantryItems.familyId, familyId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prodotto non trovato in dispensa' } });
    }

    broadcastToFamily(familyId, 'pantry_updated', { removedId: itemId });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete pantry item error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'eliminazione dalla dispensa" } });
  }
});

export default router;
