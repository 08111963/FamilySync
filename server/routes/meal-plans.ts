import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { mealPlans, mealPlanItems, recipes, recipeIngredients, shoppingLists, shoppingItems } from '../../shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { logger } from '../lib/logger';
import { broadcastToFamily } from '../lib/websocket';
import { normalizeItemName } from '../lib/normalize';
import { isUniqueViolation } from '../lib/db-errors';
import { reserveBaseSlot, baseLimitBody } from '../lib/base-usage';

const router = Router();

const createMealPlanSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().optional(),
  preferences: z.object({
    diet: z.string().optional(),
    allergies: z.string().optional(),
    maxTimeMinutes: z.number().optional(),
    mealsPerDay: z.number().optional(),
  }).optional(),
  items: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    recipeId: z.string().uuid().optional().nullable(),
    titleOverride: z.string().optional().nullable(),
    servings: z.number().int().positive().optional(),
    notes: z.string().optional(),
    ingredients: z.array(z.object({
      name: z.string(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
    })).optional().nullable(),
  })),
});

router.post('/:familyId/meal-plans', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createMealPlanSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { items, ...planData } = parsed.data;

    // Una sola settimana per famiglia: se esiste già un piano per quella data, 409.
    const [existing] = await db.select({ id: mealPlans.id })
      .from(mealPlans)
      .where(and(eq(mealPlans.familyId, familyId), eq(mealPlans.weekStartDate, planData.weekStartDate)))
      .limit(1);

    if (existing) {
      return res.status(409).json({
        error: {
          code: "PLAN_EXISTS",
          message: "Esiste già un piano pasti per questa settimana. Eliminalo prima di crearne uno nuovo.",
          planId: existing.id,
        },
      });
    }

    let plan;
    try {
      [plan] = await db.insert(mealPlans).values({
        familyId,
        createdByUserId: req.user!.userId,
        weekStartDate: planData.weekStartDate,
        title: planData.title,
        preferences: planData.preferences,
      }).returning();
    } catch (insertErr) {
      // Race condition: vincolo unique (familyId, weekStartDate) scattato tra il check e l'insert.
      if (isUniqueViolation(insertErr)) {
        return res.status(409).json({
          error: { code: "PLAN_EXISTS", message: "Esiste già un piano pasti per questa settimana." },
        });
      }
      throw insertErr;
    }

    let insertedItems: any[] = [];
    if (items.length > 0) {
      insertedItems = await db.insert(mealPlanItems).values(
        items.map((item) => ({
          mealPlanId: plan.id,
          date: item.date,
          mealType: item.mealType,
          recipeId: item.recipeId ?? null,
          titleOverride: item.titleOverride ?? null,
          servings: item.servings,
          notes: item.notes,
          ingredients: item.ingredients ?? null,
        }))
      ).returning();
    }

    res.status(201).json({ ...plan, items: insertedItems });
  } catch (error) {
    logger.error('Create meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione del piano pasti" } });
  }
});

router.get('/:familyId/meal-plans', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    const plans = await db.select()
      .from(mealPlans)
      .where(eq(mealPlans.familyId, familyId))
      .orderBy(desc(mealPlans.weekStartDate));

    res.json(plans);
  } catch (error) {
    logger.error('List meal plans error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dei piani pasti" } });
  }
});

router.get('/:familyId/meal-plans/:planId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');

    const [plan] = await db.select()
      .from(mealPlans)
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    const items = await db.select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.mealPlanId, planId));

    const recipeIds = items
      .map((item) => item.recipeId)
      .filter((id): id is string => !!id);

    let recipesMap: Record<string, string> = {};
    if (recipeIds.length > 0) {
      const recipeRows = await db.select({ id: recipes.id, title: recipes.title })
        .from(recipes)
        .where(inArray(recipes.id, recipeIds));
      recipesMap = Object.fromEntries(recipeRows.map((r) => [r.id, r.title]));
    }

    const itemsWithRecipes = items.map((item) => ({
      ...item,
      recipeTitle: item.recipeId ? recipesMap[item.recipeId] ?? null : null,
    }));

    res.json({ ...plan, items: itemsWithRecipes });
  } catch (error) {
    logger.error('Get meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del piano pasti" } });
  }
});

router.delete('/:familyId/meal-plans/:planId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');

    const [plan] = await db.select()
      .from(mealPlans)
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    await db.delete(mealPlans)
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)));

    res.json({ message: "Piano pasti eliminato" });
  } catch (error) {
    logger.error('Delete meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione del piano pasti" } });
  }
});

const mealPlanItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  recipeId: z.string().uuid().optional().nullable(),
  titleOverride: z.string().max(200).optional().nullable(),
  servings: z.number().int().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
  })).optional().nullable(),
});

async function findPlan(familyId: string, planId: string) {
  const [plan] = await db.select()
    .from(mealPlans)
    .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)))
    .limit(1);
  return plan;
}

// Verifica che, se indicata, la ricetta appartenga alla famiglia.
async function recipeBelongsToFamily(familyId: string, recipeId: string): Promise<boolean> {
  const [r] = await db.select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
    .limit(1);
  return !!r;
}

router.put('/:familyId/meal-plans/:planId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');

    const parsed = z.object({ title: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Dati non validi" } });
    }

    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    const [updated] = await db.update(mealPlans)
      .set({ title: parsed.data.title })
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)))
      .returning();

    broadcastToFamily(familyId, 'meal_plan_updated', { planId });
    res.json(updated);
  } catch (error) {
    logger.error('Update meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del piano pasti" } });
  }
});

router.post('/:familyId/meal-plans/:planId/items', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');

    const parsed = mealPlanItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    if (!parsed.data.recipeId && !parsed.data.titleOverride?.trim()) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Indica una ricetta o il nome del pasto" } });
    }

    if (parsed.data.recipeId && !(await recipeBelongsToFamily(familyId, parsed.data.recipeId))) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Ricetta non trovata" } });
    }

    const [item] = await db.insert(mealPlanItems).values({
      mealPlanId: planId,
      date: parsed.data.date,
      mealType: parsed.data.mealType,
      recipeId: parsed.data.recipeId ?? null,
      titleOverride: parsed.data.titleOverride?.trim() || null,
      servings: parsed.data.servings ?? undefined,
      notes: parsed.data.notes ?? undefined,
      ingredients: parsed.data.ingredients ?? null,
    }).returning();

    broadcastToFamily(familyId, 'meal_plan_updated', { planId });
    res.status(201).json(item);
  } catch (error) {
    logger.error('Add meal plan item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiunta del pasto" } });
  }
});

router.put('/:familyId/meal-plans/:planId/items/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');
    const itemId = getParam(req, 'itemId');

    const parsed = mealPlanItemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    const [existingItem] = await db.select()
      .from(mealPlanItems)
      .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.mealPlanId, planId)))
      .limit(1);

    if (!existingItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pasto non trovato" } });
    }

    if (parsed.data.recipeId && !(await recipeBelongsToFamily(familyId, parsed.data.recipeId))) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Ricetta non trovata" } });
    }

    // Il pasto risultante deve avere una ricetta oppure un titolo.
    const nextRecipeId = parsed.data.recipeId !== undefined ? parsed.data.recipeId : existingItem.recipeId;
    const nextTitle = parsed.data.titleOverride !== undefined ? parsed.data.titleOverride : existingItem.titleOverride;
    if (!nextRecipeId && !nextTitle?.trim()) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Indica una ricetta o il nome del pasto" } });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.date !== undefined) updates.date = parsed.data.date;
    if (parsed.data.mealType !== undefined) updates.mealType = parsed.data.mealType;
    if (parsed.data.recipeId !== undefined) updates.recipeId = parsed.data.recipeId;
    if (parsed.data.titleOverride !== undefined) updates.titleOverride = parsed.data.titleOverride?.trim() || null;
    if (parsed.data.servings !== undefined) updates.servings = parsed.data.servings;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.ingredients !== undefined) updates.ingredients = parsed.data.ingredients;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Nessuna modifica indicata" } });
    }

    const [updated] = await db.update(mealPlanItems)
      .set(updates)
      .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.mealPlanId, planId)))
      .returning();

    broadcastToFamily(familyId, 'meal_plan_updated', { planId });
    res.json(updated);
  } catch (error) {
    logger.error('Update meal plan item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella modifica del pasto" } });
  }
});

router.delete('/:familyId/meal-plans/:planId/items/:itemId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');
    const itemId = getParam(req, 'itemId');

    const plan = await findPlan(familyId, planId);
    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    const [existingItem] = await db.select({ id: mealPlanItems.id })
      .from(mealPlanItems)
      .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.mealPlanId, planId)))
      .limit(1);

    if (!existingItem) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pasto non trovato" } });
    }

    await db.delete(mealPlanItems)
      .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.mealPlanId, planId)));

    broadcastToFamily(familyId, 'meal_plan_updated', { planId });
    res.json({ message: "Pasto rimosso" });
  } catch (error) {
    logger.error('Delete meal plan item error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del pasto" } });
  }
});

router.post('/:familyId/meal-plans/:planId/to-shopping-list', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const planId = getParam(req, 'planId');

    const [plan] = await db.select()
      .from(mealPlans)
      .where(and(eq(mealPlans.id, planId), eq(mealPlans.familyId, familyId)))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Piano pasti non trovato" } });
    }

    const items = await db.select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.mealPlanId, planId));

    const uniqueIngredients = new Map<string, { name: string; quantity: string | null; category: string | null }>();

    for (const item of items) {
      const inlineIngredients = item.ingredients as Array<{ name: string; quantity?: string; unit?: string }> | null;
      if (inlineIngredients && Array.isArray(inlineIngredients)) {
        for (const ing of inlineIngredients) {
          if (!ing.name) continue;
          const norm = normalizeItemName(ing.name);
          if (!norm) continue;
          if (!uniqueIngredients.has(norm)) {
            const qtyStr = ing.quantity && ing.unit
              ? `${ing.quantity} ${ing.unit}`
              : ing.quantity || ing.unit || null;
            uniqueIngredients.set(norm, {
              name: ing.name,
              quantity: qtyStr,
              category: 'food',
            });
          }
        }
      }
    }

    const recipeIds = items
      .map((item) => item.recipeId)
      .filter((id): id is string => !!id);

    if (recipeIds.length > 0) {
      const recipeIngs = await db.select()
        .from(recipeIngredients)
        .where(inArray(recipeIngredients.recipeId, recipeIds));

      for (const ing of recipeIngs) {
        if (!uniqueIngredients.has(ing.normalizedName)) {
          uniqueIngredients.set(ing.normalizedName, {
            name: ing.name,
            quantity: ing.quantity,
            category: ing.category,
          });
        }
      }
    }

    if (uniqueIngredients.size === 0) {
      return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "Nessun ingrediente trovato nel piano pasti" } });
    }

    const slot = await reserveBaseSlot(req.user!.userId, familyId, "shopping-item");
    if (slot.status === "limited") {
      return res.status(429).json(baseLimitBody(slot));
    }

    const listName = `Spesa per ${plan.title || 'Piano ' + plan.weekStartDate}`;

    const [shoppingList] = await db.insert(shoppingLists).values({
      familyId,
      name: listName,
      icon: "restaurant",
      createdBy: req.user!.userId,
    }).returning();

    const shoppingItemValues = Array.from(uniqueIngredients.values()).map((ing) => ({
      listId: shoppingList.id,
      name: ing.name,
      quantity: ing.quantity,
      category: ing.category ?? 'food',
      createdBy: req.user!.userId,
    }));

    await db.insert(shoppingItems).values(shoppingItemValues);

    broadcastToFamily(familyId, 'shopping:updated', {});

    logger.info('Meal plan converted to shopping list', { planId, ingredientCount: uniqueIngredients.size });
    res.status(201).json({ shoppingListId: shoppingList.id, ingredientCount: uniqueIngredients.size });
  } catch (error) {
    logger.error('Convert meal plan to shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella conversione in lista della spesa" } });
  }
});

export default router;
