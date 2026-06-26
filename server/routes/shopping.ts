import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { shoppingLists, shoppingItems, shoppingHistory } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { getBlockedUserIds, applyBlockedFilter } from '../lib/block-filter';
import { parseQuantityString } from '../lib/normalize';
import { logger } from '../lib/logger';

const router = Router();

const VALID_UNITS = ["pcs", "g", "kg", "ml", "l"] as const;
const VALID_CATEGORIES = ["food", "household_cleaning", "personal_care"] as const;

const createListSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  icon: z.string().optional(),
});

const quantitySchema = z.union([
  z.number().nonnegative(),
  z.string().min(1),
]).transform(v => {
  if (typeof v === "number") return v;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}).nullable().optional();

const addItemSchema = z.object({
  name: z.string().min(1, "Il nome del prodotto è obbligatorio"),
  quantity: quantitySchema,
  unit: z.enum(VALID_UNITS).optional(),
  category: z.enum(VALID_CATEGORIES).optional().default("food"),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: quantitySchema,
  unit: z.enum(VALID_UNITS).nullable().optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  note: z.string().optional(),
});

function enrichItemWithLegacyParsing(item: any) {
  if (item.unit) return item;
  if (!item.quantity) return item;
  const parsed = parseQuantityString(String(item.quantity));
  if (parsed.unit && !item.unit) {
    return { ...item, quantity: parsed.quantity, unit: parsed.unit };
  }
  return item;
}

async function verifyListOwnership(listId: string, familyId: string): Promise<boolean> {
  const [list] = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.familyId, familyId)))
    .limit(1);
  return !!list;
}

async function verifyItemOwnership(itemId: string, listId: string): Promise<boolean> {
  const [item] = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)))
    .limit(1);
  return !!item;
}

router.get('/:familyId/lists', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const blockedIds = await getBlockedUserIds(req.user!.userId, familyId);

    const listConditions: any[] = [eq(shoppingLists.familyId, familyId)];
    const blockFilter = applyBlockedFilter(shoppingLists.createdBy, blockedIds);
    if (blockFilter) listConditions.push(blockFilter);

    const lists = await db.select().from(shoppingLists).where(and(...listConditions));

    const listsWithItems = await Promise.all(lists.map(async (list) => {
      const itemConditions: any[] = [eq(shoppingItems.listId, list.id)];
      const itemBlockFilter = applyBlockedFilter(shoppingItems.createdBy, blockedIds);
      if (itemBlockFilter) itemConditions.push(itemBlockFilter);

      const items = await db.select().from(shoppingItems).where(and(...itemConditions));
      return { ...list, items: items.map(enrichItemWithLegacyParsing) };
    }));

    res.json(listsWithItems);
  } catch (error) {
    logger.error('Get shopping lists error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero liste" } });
  }
});

router.post('/:familyId/lists', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createListSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [list] = await db.insert(shoppingLists).values({
      familyId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'shopping_list_created', { ...list, items: [] });
    res.status(201).json({ ...list, items: [] });
  } catch (error) {
    logger.error('Create shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della lista" } });
  }
});

router.delete('/:familyId/lists/:listId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const listId = getParam(req, 'listId');

    if (!(await verifyListOwnership(listId, familyId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }

    await db.delete(shoppingLists).where(and(eq(shoppingLists.id, listId), eq(shoppingLists.familyId, familyId)));

    broadcastToFamily(familyId, 'shopping_list_deleted', { listId });
    res.json({ message: 'Lista eliminata' });
  } catch (error) {
    logger.error('Delete shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

router.post('/:familyId/lists/:listId/items', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const listId = getParam(req, 'listId');

    if (!(await verifyListOwnership(listId, familyId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }

    const parsed = addItemSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    let finalQuantity: number | null = parsed.data.quantity ?? null;
    let finalUnit: string | null = parsed.data.unit || null;

    if (finalQuantity != null && !finalUnit) {
      const legacyParsed = parseQuantityString(String(finalQuantity));
      if (legacyParsed.unit) {
        finalQuantity = legacyParsed.quantity;
        finalUnit = legacyParsed.unit;
      }
    }

    const [item] = await db.insert(shoppingItems).values({
      listId,
      name: parsed.data.name,
      quantity: finalQuantity != null ? String(finalQuantity) : null,
      unit: finalUnit,
      category: parsed.data.category,
      note: parsed.data.note,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'shopping_item_added', { listId, item });
    res.status(201).json(item);
  } catch (error) {
    logger.error('Add shopping item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta del prodotto" } });
  }
});

router.patch('/:familyId/lists/:listId/items/:itemId/toggle', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const listId = getParam(req, 'listId');
    const itemId = getParam(req, 'itemId');

    if (!(await verifyListOwnership(listId, familyId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }

    if (!(await verifyItemOwnership(itemId, listId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }

    const [currentItem] = await db.select().from(shoppingItems)
      .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)))
      .limit(1);

    if (!currentItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato" } });
    }

    const [item] = await db.update(shoppingItems)
      .set({
        isChecked: !currentItem.isChecked,
        checkedBy: !currentItem.isChecked ? req.user!.userId : null,
        checkedAt: !currentItem.isChecked ? new Date() : null,
      })
      .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)))
      .returning();

    if (!currentItem.isChecked) {
      await db.insert(shoppingHistory).values({
        familyId,
        itemName: item.name,
        quantity: item.quantity,
        category: item.category,
      });
    }

    broadcastToFamily(familyId, 'shopping_item_toggled', { listId, item });
    res.json(item);
  } catch (error) {
    logger.error('Toggle shopping item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});

router.patch('/:familyId/lists/:listId/items/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const listId = getParam(req, 'listId');
    const itemId = getParam(req, 'itemId');

    if (!(await verifyListOwnership(listId, familyId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }

    if (!(await verifyItemOwnership(itemId, listId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.quantity !== undefined) updateData.quantity = parsed.data.quantity != null ? String(parsed.data.quantity) : null;
    if (parsed.data.unit !== undefined) updateData.unit = parsed.data.unit;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.note !== undefined) updateData.note = parsed.data.note;

    const [item] = await db.update(shoppingItems)
      .set(updateData)
      .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)))
      .returning();

    broadcastToFamily(familyId, 'shopping_item_updated', { listId, item });
    res.json(item);
  } catch (error) {
    logger.error('Update shopping item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del prodotto" } });
  }
});

router.delete('/:familyId/lists/:listId/items/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const listId = getParam(req, 'listId');
    const itemId = getParam(req, 'itemId');

    if (!(await verifyListOwnership(listId, familyId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Lista non trovata in questa famiglia" } });
    }

    if (!(await verifyItemOwnership(itemId, listId))) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Prodotto non trovato in questa lista" } });
    }

    await db.delete(shoppingItems)
      .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)));

    broadcastToFamily(familyId, 'shopping_item_deleted', { listId, itemId });
    res.json({ message: 'Prodotto eliminato' });
  } catch (error) {
    logger.error('Delete shopping item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
