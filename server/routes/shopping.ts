import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { shoppingLists, shoppingItems, shoppingHistory, familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { broadcastToFamily } from '../lib/websocket';

const router = Router();

async function checkFamilyAccess(userId: string, familyId: string) {
  const membership = await db.select()
    .from(familyMembers)
    .where(and(
      eq(familyMembers.userId, userId),
      eq(familyMembers.familyId, familyId)
    ))
    .limit(1);
  return membership.length > 0;
}

// GET SHOPPING LISTS
router.get('/:familyId/lists', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const lists = await db.select().from(shoppingLists).where(eq(shoppingLists.familyId, familyId));
    
    const listsWithItems = await Promise.all(lists.map(async (list) => {
      const items = await db.select().from(shoppingItems).where(eq(shoppingItems.listId, list.id));
      return { ...list, items };
    }));
    
    res.json(listsWithItems);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero liste' });
  }
});

// CREATE LIST
router.post('/:familyId/lists', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const { name, icon } = req.body;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [list] = await db.insert(shoppingLists).values({
      familyId,
      name,
      icon,
      createdBy: req.user!.userId,
    }).returning();
    
    broadcastToFamily(familyId, 'shopping_list_created', { ...list, items: [] });
    
    res.status(201).json({ ...list, items: [] });
  } catch (error) {
    res.status(500).json({ error: 'Errore nella creazione della lista' });
  }
});

// DELETE LIST
router.delete('/:familyId/lists/:listId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const listId = req.params.listId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.delete(shoppingLists).where(and(
      eq(shoppingLists.id, listId),
      eq(shoppingLists.familyId, familyId)
    ));
    
    broadcastToFamily(familyId, 'shopping_list_deleted', { listId });
    
    res.json({ message: 'Lista eliminata' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

// ADD ITEM TO LIST
router.post('/:familyId/lists/:listId/items', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const listId = req.params.listId as string;
    const { name, quantity, category, note } = req.body;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [item] = await db.insert(shoppingItems).values({
      listId,
      name,
      quantity,
      category,
      note,
      createdBy: req.user!.userId,
    }).returning();
    
    broadcastToFamily(familyId, 'shopping_item_added', { listId, item });
    
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiunta del prodotto' });
  }
});

// TOGGLE ITEM
router.patch('/:familyId/lists/:listId/items/:itemId/toggle', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const listId = req.params.listId as string;
    const itemId = req.params.itemId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const [currentItem] = await db.select().from(shoppingItems).where(eq(shoppingItems.id, itemId)).limit(1);
    
    if (!currentItem) {
      return res.status(404).json({ error: 'Prodotto non trovato' });
    }
    
    const [item] = await db.update(shoppingItems)
      .set({
        isChecked: !currentItem.isChecked,
        checkedBy: !currentItem.isChecked ? req.user!.userId : null,
        checkedAt: !currentItem.isChecked ? new Date() : null,
      })
      .where(eq(shoppingItems.id, itemId))
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
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

// DELETE ITEM
router.delete('/:familyId/lists/:listId/items/:itemId', authenticate, async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const listId = req.params.listId as string;
    const itemId = req.params.itemId as string;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.delete(shoppingItems).where(eq(shoppingItems.id, itemId));
    
    broadcastToFamily(familyId, 'shopping_item_deleted', { listId, itemId });
    
    res.json({ message: 'Prodotto eliminato' });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

export default router;
