import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { mealPlans, mealPlanItems, recipes, recipeIngredients, shoppingLists, shoppingItems, pantryItems } from '../../shared/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { logger } from '../lib/logger';
import { broadcastToFamily } from '../lib/websocket';
import { normalizeItemName } from '../lib/normalize';
import { isUniqueViolation } from '../lib/db-errors';
import { reserveBaseSlot, baseLimitBody } from '../lib/base-usage';
import { toShoppingQuantity } from '../lib/shopping-quantity';
import { consolidateIngredients, canonicalIngredientKey, type IngredientEntry } from '../lib/consolidate-ingredients';

const router = Router();

const createMealPlanSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Se true, sostituisce atomicamente (stessa transazione) l'eventuale piano
  // esistente per la stessa settimana: mai finestre in cui il piano è perso.
  replace: z.boolean().optional(),
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

    const { items, replace, ...planData } = parsed.data;

    if (!replace) {
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
    }

    let result;
    try {
      // Tutto in UNA transazione: se replace=true il vecchio piano viene
      // eliminato e quello nuovo inserito atomicamente — se qualcosa fallisce
      // il vecchio piano resta intatto.
      result = await db.transaction(async (tx) => {
        if (replace) {
          await tx.delete(mealPlans).where(
            and(eq(mealPlans.familyId, familyId), eq(mealPlans.weekStartDate, planData.weekStartDate))
          );
        }
        const [plan] = await tx.insert(mealPlans).values({
          familyId,
          createdByUserId: req.user!.userId,
          weekStartDate: planData.weekStartDate,
          title: planData.title,
          preferences: planData.preferences,
        }).returning();

        let insertedItems: any[] = [];
        if (items.length > 0) {
          insertedItems = await tx.insert(mealPlanItems).values(
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
        return { plan, insertedItems };
      });
    } catch (insertErr) {
      // Race condition: vincolo unique (familyId, weekStartDate) scattato tra il check e l'insert.
      if (isUniqueViolation(insertErr)) {
        return res.status(409).json({
          error: { code: "PLAN_EXISTS", message: "Esiste già un piano pasti per questa settimana." },
        });
      }
      throw insertErr;
    }

    res.status(201).json({ ...result.plan, items: result.insertedItems });
  } catch (error) {
    logger.error('Create meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione del piano pasti" } });
  }
});

router.get('/:familyId/meal-plans', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    // Conteggio pasti aggregato (LEFT JOIN + COUNT) invece di caricare tutti gli items.
    const plans = await db.select({
      plan: mealPlans,
      itemCount: sql<number>`count(${mealPlanItems.id})::int`,
    })
      .from(mealPlans)
      .leftJoin(mealPlanItems, eq(mealPlanItems.mealPlanId, mealPlans.id))
      .where(eq(mealPlans.familyId, familyId))
      .groupBy(mealPlans.id)
      .orderBy(desc(mealPlans.weekStartDate));

    res.json(plans.map(({ plan, itemCount }) => ({ ...plan, itemCount })));
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

    // Opzionale: lista solo per un giorno del piano (body { date: "YYYY-MM-DD" }).
    const bodySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Data non valida" } });
    }
    const onlyDate = parsedBody.data.date ?? null;

    let items = await db.select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.mealPlanId, planId));
    if (onlyDate) {
      items = items.filter((it) => it.date === onlyDate);
      if (items.length === 0) {
        return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "Nessun pasto in quel giorno del piano" } });
      }
    }

    const rawEntries: IngredientEntry[] = [];

    for (const item of items) {
      const inlineIngredients = item.ingredients as Array<{ name: string; quantity?: string; unit?: string }> | null;
      if (inlineIngredients && Array.isArray(inlineIngredients)) {
        for (const ing of inlineIngredients) {
          if (!ing.name || !normalizeItemName(ing.name)) continue;
          rawEntries.push({
            name: ing.name,
            ...toShoppingQuantity(ing.quantity ?? null, ing.unit ?? null),
            category: 'food',
          });
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
        rawEntries.push({
          name: ing.name,
          ...toShoppingQuantity(ing.quantity, ing.unit),
          category: ing.category,
        });
      }
    }

    if (rawEntries.length === 0) {
      return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "Nessun ingrediente trovato nel piano pasti" } });
    }

    // Accorpa le varianti dello stesso ingrediente (olio, arance/arancia, ...)
    // sommando le quantità quando le unità sono compatibili.
    const consolidated = consolidateIngredients(rawEntries);

    // Salta gli ingredienti già presenti in Dispensa e segnalali all'utente.
    const pantry = await db.select({ name: pantryItems.name })
      .from(pantryItems)
      .where(eq(pantryItems.familyId, familyId));
    const pantryKeys = new Set(pantry.map((p) => canonicalIngredientKey(p.name)).filter(Boolean));
    const skippedFromPantry: string[] = [];
    const toBuy = consolidated.filter((ing) => {
      if (pantryKeys.has(canonicalIngredientKey(ing.name))) {
        skippedFromPantry.push(ing.name);
        return false;
      }
      return true;
    });

    if (toBuy.length === 0) {
      // Tutto già in dispensa: nessuna lista da creare, ma lo diciamo al client.
      return res.status(200).json({ shoppingListId: null, ingredientCount: 0, skippedFromPantry });
    }

    const slot = await reserveBaseSlot(req.user!.userId, familyId, "shopping-item");
    if (slot.status === "limited") {
      return res.status(429).json(baseLimitBody(slot));
    }

    const dayLabel = onlyDate
      ? new Date(`${onlyDate}T00:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      : null;
    const listName = `Spesa per ${plan.title || 'Piano ' + plan.weekStartDate}${dayLabel ? ` — ${dayLabel}` : ''}`;

    const [shoppingList] = await db.insert(shoppingLists).values({
      familyId,
      name: listName,
      icon: "restaurant",
      createdBy: req.user!.userId,
    }).returning();

    const shoppingItemValues = toBuy.map((ing) => ({
      listId: shoppingList.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category ?? 'food',
      createdBy: req.user!.userId,
    }));

    await db.insert(shoppingItems).values(shoppingItemValues);

    broadcastToFamily(familyId, 'shopping:updated', {});

    logger.info('Meal plan converted to shopping list', { planId, ingredientCount: toBuy.length, skippedFromPantry: skippedFromPantry.length, onlyDate });
    res.status(201).json({ shoppingListId: shoppingList.id, ingredientCount: toBuy.length, skippedFromPantry });
  } catch (error) {
    logger.error('Convert meal plan to shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella conversione in lista della spesa" } });
  }
});

export default router;
