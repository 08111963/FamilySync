import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { recipes, recipeIngredients } from '../../shared/schema';
import type { Recipe, RecipeIngredient } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { logger } from '../lib/logger';

const router = Router();

const createRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  servings: z.number().int().positive().optional(),
  prepTimeMinutes: z.number().int().nonnegative().optional(),
  cookTimeMinutes: z.number().int().nonnegative().optional(),
  steps: z.array(z.string()),
  tags: z.object({
    diet: z.array(z.string()).optional(),
    allergens: z.array(z.string()).optional(),
    cuisine: z.string().optional(),
    difficulty: z.string().optional(),
  }).optional(),
  source: z.enum(["ai", "manual"]).default("manual"),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    quantity: z.union([z.number(), z.string(), z.null()]).optional(),
    unit: z.enum(["g", "kg", "ml", "l", "pcs", "tbsp", "tsp", "cup", "pinch", "to_taste"]).optional().nullable(),
    notes: z.string().optional(),
    category: z.string().optional(),
  })),
});

router.post('/:familyId/recipes', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const parsed = createRecipeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { ingredients, ...recipeData } = parsed.data;

    const [recipe] = await db.insert(recipes).values({
      familyId,
      createdByUserId: req.user!.userId,
      title: recipeData.title,
      description: recipeData.description,
      servings: recipeData.servings,
      prepTimeMinutes: recipeData.prepTimeMinutes,
      cookTimeMinutes: recipeData.cookTimeMinutes,
      steps: recipeData.steps,
      tags: recipeData.tags,
      source: recipeData.source,
    }).returning();

    const insertedIngredients: RecipeIngredient[] = [];
    for (const ing of ingredients) {
      const rawQty = ing.quantity;
      const parsedQty = typeof rawQty === 'number' ? rawQty : (typeof rawQty === 'string' ? parseFloat(rawQty) : null);
      const qty = parsedQty !== null && !isNaN(parsedQty) ? parsedQty : null;
      const [inserted] = await db.insert(recipeIngredients).values({
        recipeId: recipe.id,
        name: ing.name,
        quantity: qty,
        unit: ing.unit || (qty === null ? 'to_taste' : null),
        notes: qty === null && typeof rawQty === 'string' && rawQty !== '' ? rawQty : (ing.notes || null),
        category: ing.category,
        normalizedName: ing.name.toLowerCase().trim(),
      }).returning();
      insertedIngredients.push(inserted);
    }

    res.status(201).json({ ...recipe, ingredients: insertedIngredients });
  } catch (error) {
    logger.error('Errore creazione ricetta', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della ricetta" } });
  }
});

router.get('/:familyId/recipes', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const result = await db
      .select()
      .from(recipes)
      .where(eq(recipes.familyId, familyId))
      .orderBy(desc(recipes.createdAt));

    res.json(result);
  } catch (error) {
    logger.error('Errore recupero ricette', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle ricette" } });
  }
});

router.get('/:familyId/recipes/:recipeId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, recipeId } = req.params;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
      .limit(1);

    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }

    const ingredients = await db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));

    res.json({ ...recipe, ingredients });
  } catch (error) {
    logger.error('Errore recupero ricetta', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della ricetta" } });
  }
});

router.delete('/:familyId/recipes/:recipeId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { familyId, recipeId } = req.params;

    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
      .limit(1);

    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }

    await db.delete(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)));

    res.json({ message: "Ricetta eliminata con successo" });
  } catch (error) {
    logger.error('Errore eliminazione ricetta', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione della ricetta" } });
  }
});

export default router;
