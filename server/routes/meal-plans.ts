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
import { toShoppingQuantity } from '../lib/shopping-quantity';
import { consolidateIngredients, canonicalIngredientKey, type IngredientEntry } from '../lib/consolidate-ingredients';
import {
  hasMealPlanConstraints,
  unsupportedMealPlanHealthNote,
  validateMealPlanConstraints,
  type MealPlanConstraintItem,
  type MealPlanConstraintPreferences,
} from '../lib/meal-plan-constraints';
import {
  isMealPlanDietProfile,
  legacyMealPlanDietToProfile,
  type MealPlanDietProfile,
} from '../../shared/meal-plan-diet-profiles';

const router = Router();

const createMealPlanSchema = z.object({
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Se true, sostituisce atomicamente (stessa transazione) l'eventuale piano
  // esistente per la stessa settimana: mai finestre in cui il piano è perso.
  replace: z.boolean().optional(),
  title: z.string().optional(),
  preferences: z.object({
    dietProfile: z.string().optional(),
    // Compatibilità input con client precedenti: allergies è ignorato e non
    // viene memorizzato; diet viene accettata soltanto per mappare voci note.
    diet: z.string().optional(),
    allergies: z.string().optional(),
    maxTimeMinutes: z.number().optional(),
    mealsPerDay: z.number().optional(),
    notes: z.string().optional(),
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
    steps: z.array(z.string()).optional().nullable(),
  })),
});

function canonicalMealPlanPreferences(input: unknown): MealPlanConstraintPreferences & {
  maxTimeMinutes?: number;
  mealsPerDay?: number;
} {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const requested = raw.dietProfile;
  const legacyDiet = raw.diet;
  const dietProfile = (isMealPlanDietProfile(requested)
    ? requested
    : legacyMealPlanDietToProfile(requested)) ||
    legacyMealPlanDietToProfile(legacyDiet);
  const hasLegacySelection = (typeof requested === "string" && requested.trim()) ||
    (typeof legacyDiet === "string" && legacyDiet.trim());
  return {
    ...(dietProfile
      ? { dietProfile }
      : !hasLegacySelection
        ? { dietProfile: "mediterranean" as const }
        : {}),
    ...(typeof raw.notes === "string" && raw.notes.trim() ? { notes: raw.notes.trim() } : {}),
    ...(typeof raw.maxTimeMinutes === "number" ? { maxTimeMinutes: raw.maxTimeMinutes } : {}),
    ...(typeof raw.mealsPerDay === "number" ? { mealsPerDay: raw.mealsPerDay } : {}),
  };
}

function requiresDietProfileReselection(input: unknown): boolean {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const requested = raw.dietProfile;
  if (typeof requested === "string" && requested.trim()) {
    return !isMealPlanDietProfile(requested) && !legacyMealPlanDietToProfile(requested);
  }
  const legacyDiet = raw.diet;
  return typeof legacyDiet === "string" && Boolean(legacyDiet.trim()) &&
    !legacyMealPlanDietToProfile(legacyDiet);
}

function dietProfileReselectionError() {
  return constraintErrorResponse(
    "Il profilo dieta precedente non è più disponibile: scegli di nuovo un profilo dal menu.",
  );
}

function safePlanResponse<T extends { preferences?: unknown }>(plan: T): T {
  return { ...plan, preferences: canonicalMealPlanPreferences(plan.preferences) };
}

interface ConstraintItemInput {
  mealType?: "breakfast" | "lunch" | "dinner" | "snack" | null;
  recipeId?: string | null;
  titleOverride?: string | null;
  notes?: string | null;
  ingredients?: Array<{ name: string; quantity?: string; unit?: string }> | null;
  steps?: string[] | null;
}

async function resolveConstraintItem(
  familyId: string,
  input: ConstraintItemInput,
): Promise<MealPlanConstraintItem> {
  if (!input.recipeId) {
    return {
      mealType: input.mealType,
      title: input.titleOverride,
      notes: input.notes,
      ingredients: input.ingredients,
      steps: input.steps,
    };
  }

  const [recipe] = await db.select({
    title: recipes.title,
    description: recipes.description,
    steps: recipes.steps,
  })
    .from(recipes)
    .where(and(eq(recipes.id, input.recipeId), eq(recipes.familyId, familyId)))
    .limit(1);

  if (!recipe) {
    return {
      mealType: input.mealType,
      title: input.titleOverride,
      notes: input.notes,
      ingredients: input.ingredients,
      steps: input.steps,
    };
  }

  const ingredients = input.ingredients ?? await db.select({ name: recipeIngredients.name })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, input.recipeId));

  return {
    mealType: input.mealType,
    title: input.titleOverride?.trim() || recipe.title,
    description: recipe.description,
    notes: input.notes,
    ingredients,
    steps: recipe.steps,
  };
}

function constraintErrorResponse(message = "Il pasto è incompatibile con la dieta o le allergie del piano.") {
  return {
    error: {
      code: "MEAL_PLAN_CONSTRAINT_VIOLATION",
      message,
    },
  };
}

router.post('/:familyId/meal-plans', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  let saveContext: { itemCount: number; replace: boolean; dietProfile: string } | null = null;
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createMealPlanSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { items, replace, ...planData } = parsed.data;
    if (requiresDietProfileReselection(planData.preferences)) {
      return res.status(422).json(dietProfileReselectionError());
    }
    const preferences = canonicalMealPlanPreferences(planData.preferences);
    saveContext = {
      itemCount: items.length,
      replace: replace === true,
      dietProfile: preferences.dietProfile || "mediterranean",
    };
    logger.info('Meal plan save received', {
      tag: "MEAL_PLAN_SAVE",
      stage: "received",
      ...saveContext,
    });
    const unsupportedHealthNote = unsupportedMealPlanHealthNote(preferences);
    if (unsupportedHealthNote) {
      return res.status(422).json(constraintErrorResponse(unsupportedHealthNote));
    }
    const resolvedItems = hasMealPlanConstraints(preferences)
      ? await Promise.all(items.map((item) => resolveConstraintItem(familyId, item)))
      : items.map((item) => ({
           mealType: item.mealType,
          title: item.titleOverride,
          notes: item.notes,
          ingredients: item.ingredients,
          steps: item.steps,
        }));
    const constraintViolations = validateMealPlanConstraints(
      resolvedItems,
      preferences,
    );
    if (constraintViolations.length > 0) {
      return res.status(422).json(constraintErrorResponse(
        "Il piano contiene pasti incompatibili con il profilo dieta selezionato.",
      ));
    }

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
          preferences,
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
              steps: item.steps ?? null,
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

    res.status(201).json({ ...safePlanResponse(result.plan), items: result.insertedItems });
    logger.info('Meal plan saved', {
      tag: "MEAL_PLAN_SAVE",
      stage: "completed",
      ...saveContext,
      insertedItems: result.insertedItems.length,
    });
  } catch (error) {
    logger.error('Create meal plan error', {
      tag: "MEAL_PLAN_SAVE",
      stage: "failed",
      ...(saveContext || {}),
      errorType: error instanceof Error ? error.name : "unknown",
    });
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

    if (plans.some(({ plan }) => requiresDietProfileReselection(plan.preferences))) {
      return res.status(422).json(dietProfileReselectionError());
    }
    res.json(plans.map(({ plan, itemCount }) => ({ ...safePlanResponse(plan), itemCount })));
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
    if (requiresDietProfileReselection(plan.preferences)) {
      return res.status(422).json(dietProfileReselectionError());
    }

    const items = await db.select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.mealPlanId, planId));

    const recipeIds = items
      .map((item) => item.recipeId)
      .filter((id): id is string => !!id);

    let recipesMap: Record<string, string> = {};
    const recipeDetailsMap = new Map<string, {
      description: string | null;
      servings: number | null;
      prepTimeMinutes: number | null;
      cookTimeMinutes: number | null;
      steps: string[];
      ingredients: Array<{ name: string; quantity?: string; unit?: string }>;
    }>();
    if (recipeIds.length > 0) {
      const recipeRows = await db.select({
        id: recipes.id,
        title: recipes.title,
        description: recipes.description,
        servings: recipes.servings,
        prepTimeMinutes: recipes.prepTimeMinutes,
        cookTimeMinutes: recipes.cookTimeMinutes,
        steps: recipes.steps,
      })
        .from(recipes)
        .where(and(inArray(recipes.id, recipeIds), eq(recipes.familyId, familyId)));
      const recipeIngredientRows = await db.select({
        recipeId: recipeIngredients.recipeId,
        name: recipeIngredients.name,
        quantity: recipeIngredients.quantity,
        unit: recipeIngredients.unit,
      })
        .from(recipeIngredients)
        .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
        .where(and(inArray(recipeIngredients.recipeId, recipeIds), eq(recipes.familyId, familyId)));
      const ingredientsByRecipe = new Map<string, Array<{ name: string; quantity?: string; unit?: string }>>();
      for (const ingredient of recipeIngredientRows) {
        const list = ingredientsByRecipe.get(ingredient.recipeId) ?? [];
        list.push({
          name: ingredient.name,
          ...(ingredient.quantity !== null ? { quantity: String(ingredient.quantity) } : {}),
          ...(ingredient.unit !== null ? { unit: ingredient.unit } : {}),
        });
        ingredientsByRecipe.set(ingredient.recipeId, list);
      }
      recipesMap = Object.fromEntries(recipeRows.map((recipe) => [recipe.id, recipe.title]));
      for (const recipe of recipeRows) {
        recipeDetailsMap.set(recipe.id, {
          description: recipe.description,
          servings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          steps: recipe.steps,
          ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
        });
      }
    }

    const itemsWithRecipes = items.map((item) => {
      const linked = item.recipeId ? recipeDetailsMap.get(item.recipeId) : undefined;
      return {
        ...item,
        recipeTitle: item.recipeId ? recipesMap[item.recipeId] ?? null : null,
        ...(linked ? {
          recipeDescription: linked.description,
          recipeServings: linked.servings,
          recipePrepTimeMinutes: linked.prepTimeMinutes,
          recipeCookTimeMinutes: linked.cookTimeMinutes,
        } : {}),
        ingredients: item.ingredients && item.ingredients.length > 0
          ? item.ingredients
          : linked?.ingredients ?? item.ingredients,
        steps: item.steps ?? linked?.steps ?? null,
      };
    });

    res.json({ ...safePlanResponse(plan), items: itemsWithRecipes });
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
  steps: z.array(z.string()).optional().nullable(),
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

    if (requiresDietProfileReselection(plan.preferences)) {
      return res.status(422).json(dietProfileReselectionError());
    }
    const planPreferences = canonicalMealPlanPreferences(plan.preferences);
    const unsupportedHealthNote = unsupportedMealPlanHealthNote(planPreferences || undefined);
    if (unsupportedHealthNote) {
      return res.status(422).json(constraintErrorResponse(unsupportedHealthNote));
    }
    if (hasMealPlanConstraints(planPreferences)) {
      const constraintItem = await resolveConstraintItem(familyId, parsed.data);
      const violations = validateMealPlanConstraints([constraintItem], planPreferences || undefined);
      if (violations.length > 0) {
        return res.status(422).json(constraintErrorResponse());
      }
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
      steps: parsed.data.steps ?? null,
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

    if (requiresDietProfileReselection(plan.preferences)) {
      return res.status(422).json(dietProfileReselectionError());
    }
    const planPreferences = canonicalMealPlanPreferences(plan.preferences);
    const unsupportedHealthNote = unsupportedMealPlanHealthNote(planPreferences || undefined);
    if (unsupportedHealthNote) {
      return res.status(422).json(constraintErrorResponse(unsupportedHealthNote));
    }
    if (hasMealPlanConstraints(planPreferences)) {
      const constraintItem = await resolveConstraintItem(familyId, {
        mealType: parsed.data.mealType !== undefined ? parsed.data.mealType : existingItem.mealType,
        recipeId: nextRecipeId,
        titleOverride: nextTitle,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : existingItem.notes,
        ingredients: parsed.data.ingredients !== undefined ? parsed.data.ingredients : existingItem.ingredients,
        steps: parsed.data.steps !== undefined ? parsed.data.steps : existingItem.steps,
      });
      const violations = validateMealPlanConstraints([constraintItem], planPreferences || undefined);
      if (violations.length > 0) {
        return res.status(422).json(constraintErrorResponse());
      }
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.date !== undefined) updates.date = parsed.data.date;
    if (parsed.data.mealType !== undefined) updates.mealType = parsed.data.mealType;
    if (parsed.data.recipeId !== undefined) updates.recipeId = parsed.data.recipeId;
    if (parsed.data.titleOverride !== undefined) updates.titleOverride = parsed.data.titleOverride?.trim() || null;
    if (parsed.data.servings !== undefined) updates.servings = parsed.data.servings;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.ingredients !== undefined) updates.ingredients = parsed.data.ingredients;
    if (parsed.data.steps !== undefined) updates.steps = parsed.data.steps;

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
      itemId: z.string().uuid().optional(),
    });
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Data non valida" } });
    }
    const onlyDate = parsedBody.data.date ?? null;
    const onlyItemId = parsedBody.data.itemId ?? null;

    let items = await db.select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.mealPlanId, planId));
    if (onlyItemId) {
      items = items.filter((it) => it.id === onlyItemId);
      if (items.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Pasto non trovato nel piano" } });
      }
    }
    if (onlyDate) {
      items = items.filter((it) => it.date === onlyDate);
      if (items.length === 0) {
        return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "Nessun pasto in quel giorno del piano" } });
      }
    }

    const rawEntries: IngredientEntry[] = [];
    const itemIdsWithInlineIngredients = new Set<string>();

    for (const item of items) {
      const inlineIngredients = item.ingredients as Array<{ name: string; quantity?: string; unit?: string }> | null;
      if (inlineIngredients && Array.isArray(inlineIngredients)) {
        let hasUsableInlineIngredient = false;
        for (const ing of inlineIngredients) {
          if (!ing.name || !normalizeItemName(ing.name)) continue;
          hasUsableInlineIngredient = true;
          rawEntries.push({
            name: ing.name,
            ...toShoppingQuantity(ing.quantity ?? null, ing.unit ?? null),
            category: 'food',
          });
        }
        // Gli ingredienti salvati sul pasto sono la personalizzazione
        // esplicita dell'utente/AI e devono prevalere sulla ricetta collegata,
        // come già accade nella risposta GET del piano.
        if (hasUsableInlineIngredient) itemIdsWithInlineIngredients.add(item.id);
      }
    }

    const recipeIds = items
      .filter((item) => !itemIdsWithInlineIngredients.has(item.id))
      .map((item) => item.recipeId)
      .filter((id): id is string => !!id);

    if (recipeIds.length > 0) {
      // Difesa in profondità: solo ricette della stessa famiglia, così un
      // recipeId estraneo non può copiare ingredienti di un'altra famiglia.
      const recipeIngs = await db.select({
        name: recipeIngredients.name,
        quantity: recipeIngredients.quantity,
        unit: recipeIngredients.unit,
        category: recipeIngredients.category,
      })
        .from(recipeIngredients)
        .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
        .where(and(inArray(recipeIngredients.recipeId, recipeIds), eq(recipes.familyId, familyId)));

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

    const dayLabel = onlyDate
      ? new Date(`${onlyDate}T00:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      : null;
    const itemLabel = onlyItemId && items[0]
      ? ` — ${items[0].titleOverride || items[0].mealType}`
      : "";
    const listName = `Spesa per ${plan.title || 'Piano ' + plan.weekStartDate}${dayLabel ? ` — ${dayLabel}` : ''}${itemLabel}`;

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

    logger.info('Meal plan converted to shopping list', {
      planId,
      ingredientCount: toBuy.length,
      skippedFromPantry: skippedFromPantry.length,
      onlyDate,
      onlyItemId,
    });
    res.status(201).json({ shoppingListId: shoppingList.id, ingredientCount: toBuy.length, skippedFromPantry });
  } catch (error) {
    logger.error('Convert meal plan to shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella conversione in lista della spesa" } });
  }
});

export default router;
