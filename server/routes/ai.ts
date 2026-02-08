import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { familyMembers, shoppingHistory, shoppingLists, shoppingItems, calendarEvents, chores, aiInsights } from '../../shared/schema';
import { eq, and, gte, desc, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { requireAiEnabled } from '../middleware/ai-guard';
import { generateShoppingSuggestions, optimizeChoreSchedule, generateFamilyInsights, generateRecipeSuggestions, generateWeeklyMealPlan, type ShoppingSuggestionItem } from '../lib/openai';
import { normalizeItemName } from '../lib/normalize';
import { logger } from '../lib/logger';
import { recipes, recipeIngredients } from '../../shared/schema';

const router = Router();

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'primavera';
  if (month >= 5 && month <= 7) return 'estate';
  if (month >= 8 && month <= 10) return 'autunno';
  return 'inverno';
}

const FALLBACK_POOL: ShoppingSuggestionItem[] = [
  { name: 'detersivo piatti', category: 'household_cleaning', reason: 'Essenziale per lavare le stoviglie' },
  { name: 'detersivo lavatrice', category: 'household_cleaning', reason: 'Per il bucato settimanale' },
  { name: 'ammorbidente', category: 'household_cleaning', reason: 'Rende i tessuti più morbidi' },
  { name: 'candeggina', category: 'household_cleaning', reason: 'Utile per igienizzare superfici' },
  { name: 'sgrassatore', category: 'household_cleaning', reason: 'Per pulire cucina e piani cottura' },
  { name: 'panni microfibra', category: 'household_cleaning', reason: 'Ideali per spolverare senza residui' },
  { name: 'spugne cucina', category: 'household_cleaning', reason: 'Da sostituire regolarmente per igiene' },
  { name: 'sacchetti immondizia', category: 'household_cleaning', reason: 'Indispensabili per la raccolta rifiuti' },
  { name: 'spray vetri', category: 'household_cleaning', reason: 'Per specchi e finestre senza aloni' },
  { name: 'shampoo', category: 'personal_care', reason: 'Per la cura quotidiana dei capelli' },
  { name: 'bagnoschiuma', category: 'personal_care', reason: 'Per la doccia di tutta la famiglia' },
  { name: 'dentifricio', category: 'personal_care', reason: 'Per l\'igiene orale quotidiana' },
  { name: 'spazzolini da denti', category: 'personal_care', reason: 'Da sostituire ogni 3 mesi' },
  { name: 'filo interdentale', category: 'personal_care', reason: 'Complemento allo spazzolino' },
  { name: 'deodorante', category: 'personal_care', reason: 'Per la freschezza quotidiana' },
  { name: 'sapone mani', category: 'personal_care', reason: 'Per l\'igiene delle mani' },
  { name: 'crema idratante', category: 'personal_care', reason: 'Per proteggere la pelle' },
  { name: 'carta igienica', category: 'personal_care', reason: 'Bene di prima necessità' },
  { name: 'fazzoletti', category: 'personal_care', reason: 'Sempre utili in casa e fuori' },
  { name: 'latte fresco', category: 'food', reason: 'Per colazione e ricette' },
  { name: 'uova', category: 'food', reason: 'Versatili per tanti piatti' },
  { name: 'pasta', category: 'food', reason: 'Base della cucina italiana' },
  { name: 'riso', category: 'food', reason: 'Alternativa leggera alla pasta' },
  { name: 'lenticchie', category: 'food', reason: 'Ricche di proteine vegetali' },
  { name: 'olio extravergine', category: 'food', reason: 'Condimento essenziale' },
  { name: 'mele', category: 'food', reason: 'Frutta pratica come spuntino' },
  { name: 'zucchine', category: 'food', reason: 'Verdura leggera e versatile' },
  { name: 'yogurt bianco', category: 'food', reason: 'Ottimo per colazione e merenda' },
  { name: 'pane integrale', category: 'food', reason: 'Ricco di fibre' },
  { name: 'caffè', category: 'food', reason: 'Indispensabile per la mattina' },
  { name: 'pomodori pelati', category: 'food', reason: 'Base per sughi e condimenti' },
  { name: 'tonno in scatola', category: 'food', reason: 'Pratico e ricco di proteine' },
  { name: 'burro', category: 'food', reason: 'Utile per cucinare e condire' },
  { name: 'parmigiano reggiano', category: 'food', reason: 'Per insaporire primi e secondi' },
  { name: 'spinaci freschi', category: 'food', reason: 'Verdura ricca di ferro' },
];

interface TaggedItem extends ShoppingSuggestionItem {
  source: 'ai' | 'fallback';
}

router.get('/:familyId/shopping-suggestions', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentPurchasesRows = await db.select()
      .from(shoppingHistory)
      .where(and(eq(shoppingHistory.familyId, familyId), gte(shoppingHistory.purchasedAt, thirtyDaysAgo)))
      .orderBy(desc(shoppingHistory.purchasedAt))
      .limit(50);
    const recentPurchases = recentPurchasesRows.map(h => h.itemName);

    const familyLists = await db.select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(eq(shoppingLists.familyId, familyId));

    let alreadyOnList: string[] = [];
    let completedRecently: string[] = [];

    if (familyLists.length > 0) {
      const listIds = familyLists.map(l => l.id);
      const allItems = await db.select({
        name: shoppingItems.name,
        isChecked: shoppingItems.isChecked,
        checkedAt: shoppingItems.checkedAt,
        createdAt: shoppingItems.createdAt,
      })
        .from(shoppingItems)
        .where(inArray(shoppingItems.listId, listIds));

      alreadyOnList = allItems.filter(i => !i.isChecked).map(i => i.name);

      completedRecently = allItems
        .filter(i => {
          if (!i.isChecked) return false;
          const refDate = i.checkedAt || i.createdAt;
          return refDate >= thirtyDaysAgo;
        })
        .map(i => i.name);
    }

    const recentInsights = await db.select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.familyId, familyId),
        eq(aiInsights.type, 'shopping_suggestions'),
        gte(aiInsights.createdAt, fourteenDaysAgo),
      ))
      .orderBy(desc(aiInsights.createdAt))
      .limit(10);

    const recentSuggestions: string[] = [];
    for (const ins of recentInsights) {
      const data = ins.actionData as { items?: string[] } | null;
      if (data?.items && Array.isArray(data.items)) {
        for (const name of data.items) {
          if (typeof name === 'string') recentSuggestions.push(name);
        }
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const upcomingEvents = await db.select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.familyId, familyId), gte(calendarEvents.date, today!)))
      .limit(10);

    const aiResult = await generateShoppingSuggestions({
      familySize: members.length || 1,
      season: getCurrentSeason(),
      upcomingEvents: upcomingEvents.map(e => e.title),
      recentPurchases,
      alreadyOnList,
      completedRecently,
      recentSuggestions,
    });

    const alreadyOnListSet = new Set(alreadyOnList.map(normalizeItemName).filter(n => n.length > 0));
    const completedRecentlySet = new Set(completedRecently.map(normalizeItemName).filter(n => n.length > 0));
    const recentPurchasesSet = new Set(recentPurchases.map(normalizeItemName).filter(n => n.length > 0));
    const recentSuggestionsSet = new Set(recentSuggestions.map(normalizeItemName).filter(n => n.length > 0));

    const totalFromAI = aiResult.items.length;

    const seenNames = new Set<string>();
    const uniqueItems: TaggedItem[] = [];
    let droppedDuplicates = 0;
    for (const item of aiResult.items) {
      const norm = normalizeItemName(item.name);
      if (!norm || seenNames.has(norm)) {
        if (norm && seenNames.has(norm)) droppedDuplicates++;
        continue;
      }
      seenNames.add(norm);
      uniqueItems.push({ ...item, source: 'ai' });
    }
    const uniqueAfterNormalize = uniqueItems.length;

    let droppedAlreadyOnList = 0;
    let droppedCompletedRecently = 0;
    let droppedRecentPurchases = 0;
    let droppedRecentSuggestions = 0;
    const filtered: TaggedItem[] = [];

    for (const item of uniqueItems) {
      const norm = normalizeItemName(item.name);
      if (alreadyOnListSet.has(norm)) { droppedAlreadyOnList++; continue; }
      if (completedRecentlySet.has(norm)) { droppedCompletedRecently++; continue; }
      if (recentPurchasesSet.has(norm)) { droppedRecentPurchases++; continue; }
      if (recentSuggestionsSet.has(norm)) { droppedRecentSuggestions++; continue; }
      filtered.push(item);
    }
    const keptAfterFilters = filtered.length;

    const allForbiddenSet = new Set<string>();
    for (const s of [alreadyOnListSet, completedRecentlySet, recentPurchasesSet, recentSuggestionsSet]) {
      for (const v of s) allForbiddenSet.add(v);
    }
    for (const n of seenNames) allForbiddenSet.add(n);

    const householdAI = filtered.filter(i => i.category === 'household_cleaning');
    const personalAI = filtered.filter(i => i.category === 'personal_care');
    const otherAI = filtered.filter(i => i.category !== 'household_cleaning' && i.category !== 'personal_care');

    const finalItems: TaggedItem[] = [];
    const usedNorms = new Set<string>();

    const addItem = (item: TaggedItem): boolean => {
      const norm = normalizeItemName(item.name);
      if (usedNorms.has(norm) || allForbiddenSet.has(norm)) return false;
      usedNorms.add(norm);
      allForbiddenSet.add(norm);
      finalItems.push(item);
      return true;
    };

    let selectedFromAI = 0;
    let selectedFromFallback = 0;
    let fallbackUsedForHouseholdMin = 0;
    let fallbackUsedForPersonalMin = 0;

    for (const item of householdAI) {
      if (finalItems.filter(i => i.category === 'household_cleaning').length >= 3) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const householdCount1 = finalItems.filter(i => i.category === 'household_cleaning').length;
    if (householdCount1 < 3) {
      const pool = [...FALLBACK_POOL].filter(fb => fb.category === 'household_cleaning').sort(() => Math.random() - 0.5);
      for (const fb of pool) {
        if (finalItems.filter(i => i.category === 'household_cleaning').length >= 3) break;
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: 'fallback' })) {
          selectedFromFallback++;
          fallbackUsedForHouseholdMin++;
        }
      }
    }

    for (const item of personalAI) {
      if (finalItems.filter(i => i.category === 'personal_care').length >= 2) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const personalCount1 = finalItems.filter(i => i.category === 'personal_care').length;
    if (personalCount1 < 2) {
      const pool = [...FALLBACK_POOL].filter(fb => fb.category === 'personal_care').sort(() => Math.random() - 0.5);
      for (const fb of pool) {
        if (finalItems.filter(i => i.category === 'personal_care').length >= 2) break;
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: 'fallback' })) {
          selectedFromFallback++;
          fallbackUsedForPersonalMin++;
        }
      }
    }

    for (const item of otherAI) {
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }

    for (const item of householdAI) {
      if (finalItems.length >= 10) break;
      addItem(item) && selectedFromAI++;
    }
    for (const item of personalAI) {
      if (finalItems.length >= 10) break;
      addItem(item) && selectedFromAI++;
    }

    if (finalItems.length < 10) {
      const shuffled = [...FALLBACK_POOL].sort(() => Math.random() - 0.5);
      for (const fb of shuffled) {
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: 'fallback' })) {
          selectedFromFallback++;
        }
      }
    }

    const householdCount = finalItems.filter(i => i.category === 'household_cleaning').length;
    const personalCount = finalItems.filter(i => i.category === 'personal_care').length;
    const finalCount = finalItems.length;

    console.log(JSON.stringify({
      tag: "AI_SHOPPING_SUGGESTIONS",
      familyId,
      totalFromAI,
      uniqueAfterNormalize,
      droppedDuplicates,
      droppedAlreadyOnList,
      droppedCompletedRecently,
      droppedRecentPurchases,
      droppedRecentSuggestions,
      keptAfterFilters,
      selectedFromAI,
      selectedFromFallback,
      fallbackUsedForHouseholdMin,
      fallbackUsedForPersonalMin,
      finalCount,
      categoryCounts: { household_cleaning: householdCount, personal_care: personalCount, food: finalCount - householdCount - personalCount },
    }));

    const responseItems: ShoppingSuggestionItem[] = finalItems.map(({ source, ...rest }) => rest);

    try {
      await db.insert(aiInsights).values({
        familyId,
        type: 'shopping_suggestions',
        title: 'Shopping suggestions history',
        description: 'internal',
        dismissed: true,
        actionData: {
          items: responseItems.map(i => i.name),
          categoriesCount: { household_cleaning: householdCount, personal_care: personalCount, food: finalCount - householdCount - personalCount },
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (persistErr) {
      logger.error('Failed to persist shopping suggestions history', { error: String(persistErr) });
    }

    res.json({ items: responseItems });
  } catch (error) {
    logger.error('Shopping suggestions error', { error: String(error) });
    res.status(500).json({ error: { code: "AI_ERROR", message: "Errore nella generazione suggerimenti" } });
  }
});

router.get('/:familyId/chore-optimization', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const pendingChores = await db.select()
      .from(chores)
      .where(and(eq(chores.familyId, familyId), eq(chores.isCompleted, false)));

    if (pendingChores.length === 0) {
      return res.json({ assignments: [], message: 'Nessuna faccenda da assegnare' });
    }

    const optimization = await optimizeChoreSchedule({
      members: members.map(m => ({ id: m.id, name: m.nickname || 'Membro', points: m.points || 0 })),
      chores: pendingChores.map(c => ({ id: c.id, title: c.title, estimatedMinutes: c.estimatedMinutes || 30 })),
    });

    res.json(optimization);
  } catch (error) {
    logger.error('Chore optimization error', { error: String(error) });
    res.status(500).json({ error: { code: "AI_ERROR", message: "Errore nell'ottimizzazione" } });
  }
});

router.get('/:familyId/insights', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const savedInsights = await db.select()
      .from(aiInsights)
      .where(and(eq(aiInsights.familyId, familyId), eq(aiInsights.dismissed, false)))
      .orderBy(desc(aiInsights.createdAt))
      .limit(5);

    res.json(savedInsights);
  } catch (error) {
    logger.error('Get insights error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero insights" } });
  }
});

router.post('/:familyId/insights/generate', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;

    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgo = sevenDaysAgo.toISOString().split('T')[0];

    const events = await db.select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.familyId, familyId), gte(calendarEvents.date, weekAgo!)));

    const completedChores = await db.select()
      .from(chores)
      .where(and(eq(chores.familyId, familyId), eq(chores.isCompleted, true), gte(chores.completedAt, sevenDaysAgo)));

    const pendingChores = await db.select()
      .from(chores)
      .where(and(eq(chores.familyId, familyId), eq(chores.isCompleted, false)));

    const topMember = members.reduce((top, m) =>
      (m.points || 0) > (top.points || 0) ? m : top, members[0]);

    const insights = await generateFamilyInsights({
      events: events.length,
      completedChores: completedChores.length,
      pendingChores: pendingChores.length,
      topContributor: topMember?.nickname || 'Nessuno',
      weeklyPoints: completedChores.reduce((sum, c) => sum + (c.points || 0), 0),
    });

    const savedInsights = [];
    for (const insight of insights.insights || []) {
      const [saved] = await db.insert(aiInsights).values({
        familyId,
        type: insight.type || 'suggestion',
        title: insight.title,
        description: insight.description,
      }).returning();
      savedInsights.push(saved);
    }

    res.json(savedInsights);
  } catch (error) {
    logger.error('Generate insights error', { error: String(error) });
    res.status(500).json({ error: { code: "AI_ERROR", message: "Errore nella generazione insights" } });
  }
});

router.patch('/:familyId/insights/:insightId/dismiss', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { insightId } = req.params;

    await db.update(aiInsights)
      .set({ dismissed: true })
      .where(eq(aiInsights.id, insightId));

    res.json({ message: 'Insight nascosto' });
  } catch (error) {
    logger.error('Dismiss insight error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore" } });
  }
});

router.post('/:familyId/recipe-suggestions', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const { dietaryPreferences, allergies, maxTimeMinutes, cuisinePreferences, excludedIngredients, count, excludeTitles } = req.body || {};

    const existingRecipes = await db.select({ title: recipes.title })
      .from(recipes)
      .where(eq(recipes.familyId, familyId))
      .orderBy(desc(recipes.createdAt))
      .limit(50);
    const dbTitles = existingRecipes.map(r => r.title);
    const extraTitles = Array.isArray(excludeTitles) ? excludeTitles : [];
    const lastRecipeTitles = [...new Set([...dbTitles, ...extraTitles])];

    const result = await generateRecipeSuggestions({
      familySize: members.length || 1,
      dietaryPreferences,
      allergies,
      maxTimeMinutes: maxTimeMinutes || null,
      cuisinePreferences: cuisinePreferences || null,
      excludedIngredients: excludedIngredients || null,
      lastRecipeTitles,
      count: Math.min(count || 12, 20),
    });

    const seenTitles = new Set<string>();
    const dedupedRecipes = result.recipes.filter(r => {
      const norm = r.title.toLowerCase().trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });

    res.json({ recipes: dedupedRecipes, generatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error('Recipe suggestions error', { error: String(error) });
    res.status(500).json({ error: { code: "AI_ERROR", message: "Errore nella generazione ricette" } });
  }
});

router.post('/:familyId/weekly-meal-plan', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const { weekStartDate, preferences } = req.body || {};

    if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "weekStartDate è obbligatorio (YYYY-MM-DD)" } });
    }

    const result = await generateWeeklyMealPlan({
      familySize: members.length || 1,
      weekStartDate,
      preferences,
    });

    res.json({ ...result, weekStartDate });
  } catch (error) {
    logger.error('Weekly meal plan error', { error: String(error) });
    res.status(500).json({ error: { code: "AI_ERROR", message: "Errore nella generazione del piano pasti" } });
  }
});

export default router;
