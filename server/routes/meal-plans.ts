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

    const [plan] = await db.insert(mealPlans).values({
      familyId,
      createdByUserId: req.user!.userId,
      weekStartDate: planData.weekStartDate,
      title: planData.title,
      preferences: planData.preferences,
    }).returning();

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
