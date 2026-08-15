import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { shoppingLists, shoppingItems, shoppingHistory, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { sendPushToFamily } from '../lib/push';
import { getBlockedUserIds, getBlockRelatedUserIds, applyBlockedFilter } from '../lib/block-filter';
import { parseQuantityString } from '../lib/normalize';
import { logger } from '../lib/logger';
import { reserveBaseSlot, baseLimitBody } from '../lib/base-usage';
import { addToPantry } from './pantry';

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

// ---------------------------------------------------------------------------
// Push raggruppato per la spesa: quando un familiare aggiunge più prodotti di
// fila, gli altri ricevono UNA sola notifica con l'elenco, non una per
// prodotto. Buffer in memoria per (famiglia, autore): la notifica parte
// QUIET_MS dopo l'ultimo prodotto aggiunto, con un tetto massimo MAX_WAIT_MS
// dal primo (così una dettatura lunga non la rimanda all'infinito).
const PUSH_BATCH_QUIET_MS = 25_000;
const PUSH_BATCH_MAX_WAIT_MS = 120_000;
const PUSH_BATCH_MAX_NAMES = 12;

type PendingShoppingPush = {
  familyId: string;
  authorId: string;
  names: string[];
  extraCount: number;
  firstAt: number;
  timer: ReturnType<typeof setTimeout>;
};
const pendingShoppingPushes = new Map<string, PendingShoppingPush>();

async function flushShoppingItemPush(key: string): Promise<void> {
  const pending = pendingShoppingPushes.get(key);
  if (!pending) return;
  pendingShoppingPushes.delete(key);
  clearTimeout(pending.timer);
  const { familyId, authorId, names, extraCount } = pending;
  const excluded = new Set(await getBlockRelatedUserIds(authorId, familyId));
  excluded.add(authorId);
  const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, authorId)).limit(1);
  const who = author?.name ?? 'Un familiare';
  const total = names.length + extraCount;
  const body = total === 1
    ? `${who} ha aggiunto "${names[0]}" alla spesa`
    : `${who} ha aggiunto ${total} prodotti alla spesa: ${names.join(', ')}${extraCount > 0 ? '…' : ''}`;
  await sendPushToFamily(familyId, {
    title: 'Lista della spesa',
    body,
    data: { route: '/(tabs)/shopping' },
  }, { excludeUserIds: excluded });
}

function queueShoppingItemPush(familyId: string, authorId: string, itemName: string): void {
  const key = `${familyId}:${authorId}`;
  const existing = pendingShoppingPushes.get(key);
  const flush = () => { flushShoppingItemPush(key).catch((error) => logger.error('Shopping push flush error', { error: String(error) })); };
  if (!existing) {
    const timer = setTimeout(flush, PUSH_BATCH_QUIET_MS);
    pendingShoppingPushes.set(key, { familyId, authorId, names: [itemName], extraCount: 0, firstAt: Date.now(), timer });
    return;
  }
  if (existing.names.length < PUSH_BATCH_MAX_NAMES) existing.names.push(itemName);
  else existing.extraCount += 1;
  clearTimeout(existing.timer);
  const elapsed = Date.now() - existing.firstAt;
  const wait = Math.max(1_000, Math.min(PUSH_BATCH_QUIET_MS, PUSH_BATCH_MAX_WAIT_MS - elapsed));
  existing.timer = setTimeout(flush, wait);

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

    const gate = await reserveBaseSlot(req.user!.userId, familyId, "shopping-item");
    if (gate.status === "limited") {
      return res.status(429).json(baseLimitBody(gate));
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

    // Push agli altri membri (esclusi autore e utenti in blocco reciproco),
    // raggruppato: chi aggiunge più prodotti di fila genera UNA sola notifica
    // con l'elenco, non una notifica per prodotto.
    queueShoppingItemPush(familyId, req.user!.userId, item.name);

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

      // Prodotto acquistato → va in dispensa (dedup per nome normalizzato+unità).
      // Best-effort: un errore qui non deve bloccare il toggle.
      try {
        const pantryResult = await addToPantry({
          familyId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          addedBy: req.user!.userId,
        });
        broadcastToFamily(familyId, 'pantry_updated', { item: pantryResult.item });
      } catch (pantryErr) {
        logger.error('Add purchased item to pantry failed', { error: String(pantryErr) });
      }
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
