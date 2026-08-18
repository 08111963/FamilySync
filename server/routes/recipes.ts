import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { recipes, recipeIngredients, ingredientUnitEnum, shoppingLists, shoppingItems } from '../../shared/schema';
import type { Recipe, RecipeIngredient } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { logger } from '../lib/logger';
import { broadcastToFamily } from '../lib/websocket';
import { normalizeItemName } from '../lib/normalize';
import { toShoppingQuantity } from '../lib/shopping-quantity';

type IngredientUnit = (typeof ingredientUnitEnum.enumValues)[number];

// Etichette italiane per le unità nella lista della spesa (max 10 caratteri: colonna unit)
const UNIT_LABELS: Record<string, string> = {
  g: "g", kg: "kg", ml: "ml", l: "l", pcs: "pz",
  tbsp: "cucchiai", tsp: "cucchiaini", cup: "tazza", pinch: "pizzico", to_taste: "q.b.",
};

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
    const familyId = getParam(req, 'familyId');
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
        quantity: qty === null ? null : String(qty),
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

const bulkRecipeSchema = z.object({
  familyId: z.string().uuid(),
  recipes: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    servings: z.number().int().positive().optional(),
    prepTimeMinutes: z.number().int().nonnegative().optional(),
    cookTimeMinutes: z.number().int().nonnegative().optional(),
    steps: z.array(z.string()).min(1),
    tags: z.object({
      diet: z.array(z.string()).optional(),
      allergens: z.array(z.string()).optional(),
      cuisine: z.string().optional(),
      difficulty: z.string().optional(),
    }).optional(),
    imageUrl: z.string().max(500).optional(),
    ingredients: z.array(z.object({
      name: z.string().min(1),
      quantity: z.union([z.number(), z.string(), z.null()]).optional(),
      unit: z.string().optional().nullable(),
      notes: z.string().optional(),
      category: z.string().optional(),
    })).min(1),
  })).min(1).max(20),
});

const VALID_UNITS: Set<string> = new Set(ingredientUnitEnum.enumValues);

function isIngredientUnit(u: string): u is IngredientUnit {
  return VALID_UNITS.has(u);
}

const UNIT_MAP: Record<string, IngredientUnit> = {
  grammi: 'g', grammo: 'g', gr: 'g',
  chilogrammi: 'kg', chilogrammo: 'kg',
  millilitri: 'ml', millilitro: 'ml',
  litri: 'l', litro: 'l',
  pezzi: 'pcs', pezzo: 'pcs', pz: 'pcs', spicchi: 'pcs', spicchio: 'pcs',
  fette: 'pcs', fetta: 'pcs', foglie: 'pcs', foglia: 'pcs',
  rametti: 'pcs', rametto: 'pcs', mazzi: 'pcs', mazzo: 'pcs',
  cucchiai: 'tbsp', cucchiaio: 'tbsp',
  cucchiaini: 'tsp', cucchiaino: 'tsp',
  tazza: 'cup', tazze: 'cup', bicchiere: 'cup', bicchieri: 'cup',
  pizzico: 'pinch', pizzichi: 'pinch',
  'q.b.': 'to_taste', qb: 'to_taste', 'quanto basta': 'to_taste',
};

function sanitizeUnit(unit: string | null | undefined): IngredientUnit | null {
  if (!unit) return null;
  const lower = unit.toLowerCase().trim();
  if (isIngredientUnit(lower)) return lower;
  if (UNIT_MAP[lower]) return UNIT_MAP[lower];
  return 'pcs';
}

router.post('/bulk', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const parsed = bulkRecipeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { familyId, recipes: recipesToSave } = parsed.data;

    const createdIds: string[] = [];

    for (const recipeData of recipesToSave) {
      const { ingredients, ...rest } = recipeData;

      // Accetta solo immagini generate dal nostro backend (path relativo sotto
      // /uploads/recipe-images/), per evitare URL arbitrari salvati in DB.
      const safeImageUrl =
        rest.imageUrl && /^\/uploads\/recipe-images\/[A-Za-z0-9_-]+\.(png|webp)$/.test(rest.imageUrl)
          ? rest.imageUrl
          : null;

      const [recipe] = await db.insert(recipes).values({
        familyId,
        createdByUserId: req.user!.userId,
        title: rest.title,
        description: rest.description,
        servings: rest.servings,
        prepTimeMinutes: rest.prepTimeMinutes,
        cookTimeMinutes: rest.cookTimeMinutes,
        steps: rest.steps,
        tags: rest.tags,
        imageUrl: safeImageUrl,
        source: 'ai',
      }).returning();

      for (const ing of ingredients) {
        const rawQty = ing.quantity;
        const parsedQty = typeof rawQty === 'number' ? rawQty : (typeof rawQty === 'string' ? parseFloat(rawQty) : null);
        const qty = parsedQty !== null && !isNaN(parsedQty) ? parsedQty : null;
        const safeUnit = sanitizeUnit(ing.unit) || (qty === null ? 'to_taste' : null);
        await db.insert(recipeIngredients).values({
          recipeId: recipe.id,
          name: ing.name,
          quantity: qty === null ? null : String(qty),
          unit: safeUnit,
          notes: qty === null && typeof rawQty === 'string' && rawQty !== '' ? rawQty : (ing.notes || null),
          category: ing.category,
          normalizedName: ing.name.toLowerCase().trim(),
        });
      }

      createdIds.push(recipe.id);
    }

    res.status(201).json({ recipeIds: createdIds, count: createdIds.length });
  } catch (error) {
    logger.error('Errore bulk creazione ricette', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel salvataggio delle ricette" } });
  }
});

router.get('/:familyId/recipes', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

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
    const familyId = getParam(req, 'familyId');
    const recipeId = getParam(req, 'recipeId');

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
    const familyId = getParam(req, 'familyId');
    const recipeId = getParam(req, 'recipeId');

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

// Invia gli ingredienti di una ricetta in una lista della spesa.
// Se il body contiene listId, aggiunge alla lista esistente (evitando doppioni
// già presenti e non spuntati); altrimenti crea una nuova lista "Spesa per <ricetta>".
const toShoppingListSchema = z.object({
  listId: z.string().uuid().optional().nullable(),
});

router.post('/:familyId/recipes/:recipeId/to-shopping-list', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const recipeId = getParam(req, 'recipeId');

    const parsed = toShoppingListSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Dati non validi" } });
    }

    const [recipe] = await db.select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)))
      .limit(1);

    if (!recipe) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ricetta non trovata" } });
    }

    const ingredients = await db.select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, recipeId));

    // Dedup interno alla ricetta per nome normalizzato
    const unique = new Map<string, { name: string; quantity: string | null; unit: string | null }>();
    for (const ing of ingredients) {
      // Chiave con la stessa normalizzazione usata per il dedup contro la lista:
      // il normalizedName salvato nel DB può derivare da versioni precedenti.
      const key = normalizeItemName(ing.name) || ing.normalizedName;
      if (!unique.has(key)) {
        const unitLabel = ing.unit ? (UNIT_LABELS[ing.unit] ?? ing.unit) : null;
        unique.set(key, {
          name: ing.name,
          ...toShoppingQuantity(ing.quantity, unitLabel),
        });
      }
    }

    if (unique.size === 0) {
      return res.status(400).json({ error: { code: "NO_INGREDIENTS", message: "La ricetta non ha ingredienti" } });
    }

    let listId = parsed.data.listId ?? null;
    let listName: string;

    if (listId) {
      const [list] = await db.select()
        .from(shoppingLists)
        .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.familyId, familyId)))
        .limit(1);
      if (!list) {
        return res.status(404).json({ error: { code: "LIST_NOT_FOUND", message: "Lista della spesa non trovata" } });
      }
      listName = list.name;

      // Evita doppioni: salta ingredienti già presenti e non ancora spuntati
      const existingItems = await db.select({ name: shoppingItems.name, isChecked: shoppingItems.isChecked })
        .from(shoppingItems)
        .where(eq(shoppingItems.listId, listId));
      const existingNorm = new Set(
        existingItems.filter((i) => !i.isChecked).map((i) => normalizeItemName(i.name)).filter((n) => n.length > 0)
      );
      for (const norm of Array.from(unique.keys())) {
        if (existingNorm.has(norm)) unique.delete(norm);
      }

      if (unique.size === 0) {
        return res.status(200).json({ shoppingListId: listId, listName, ingredientCount: 0, alreadyPresent: true });
      }
    } else {
      const [newList] = await db.insert(shoppingLists).values({
        familyId,
        name: `Spesa per ${recipe.title}`.slice(0, 255),
        icon: "restaurant",
        createdBy: req.user!.userId,
      }).returning();
      listId = newList.id;
      listName = newList.name;
    }

    await db.insert(shoppingItems).values(
      Array.from(unique.values()).map((ing) => ({
        listId: listId!,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: 'food',
        createdBy: req.user!.userId,
      }))
    );

    broadcastToFamily(familyId, 'shopping:updated', {});

    logger.info('Recipe converted to shopping list', { recipeId, listId, ingredientCount: unique.size });
    res.status(201).json({ shoppingListId: listId, listName, ingredientCount: unique.size });
  } catch (error) {
    logger.error('Convert recipe to shopping list error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'invio alla lista della spesa" } });
  }
});

export default router;
