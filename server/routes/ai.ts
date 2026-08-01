import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { db } from '../db';
import { familyMembers, shoppingHistory, shoppingLists, shoppingItems, calendarEvents, chores, aiInsights, pantryItems, users, recipeGenSessions } from '../../shared/schema';
import { eq, and, gte, desc, inArray, lt } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { requireAiEnabled } from '../middleware/ai-guard';
import { generateShoppingSuggestions, optimizeChoreSchedule, generateFamilyInsights, generateBudgetInsights, generateRecipeSuggestions, generateWeeklyMealPlan, searchRecipesByQuery, transcribeAudio, generateRecipeImage, parseEventFromText, parseExpenseFromText, parseChoreFromText, type ShoppingSuggestionItem } from '../lib/openai';
import { normalizeItemName } from '../lib/normalize';
import { logger } from '../lib/logger';
import { recipes, recipeIngredients } from '../../shared/schema';
import { reserveAiSlot, finalizeAiUsage, withAiUsage } from '../lib/ai-usage';
import { resolveMealPlanVariants } from '../lib/ai-policy';
import { isAiError } from '../lib/ai-errors';
import { recipeImageCacheKey, createRecipeImagePrewarm } from '../lib/recipe-image-prewarm';

const router = Router();

/** Mappa un AiError sul suo HTTP status + messaggio utente; altrimenti 500 generico. */
/**
 * Consenso salute (art. 9 GDPR): allergie/intolleranze possono rivelare dati
 * relativi alla salute. Verifica fail-closed: in caso di dubbio o errore,
 * il dato NON viene inviato a OpenAI.
 */
async function userHasAiHealthConsent(userId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ aiHealthConsent: users.aiHealthConsent })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.aiHealthConsent === true;
  } catch {
    return false;
  }
}

/** Rimuove le allergie dalle preferenze pasti se manca il consenso ai_health. */
async function stripHealthDataIfNoConsent<T extends { allergies?: unknown } | undefined>(
  userId: string,
  preferences: T,
): Promise<T> {
  if (!preferences || preferences.allergies == null) return preferences;
  if (await userHasAiHealthConsent(userId)) return preferences;
  const { allergies: _omitted, ...rest } = preferences as Record<string, unknown>;
  return rest as T;
}

function sendAiError(res: Response, error: unknown, fallbackMsg: string) {
  if (isAiError(error)) {
    return res.status(error.httpStatus).json({ error: { code: error.code, message: error.userMessage } });
  }
  return res.status(500).json({ error: { code: "AI_ERROR", message: fallbackMsg } });
}

/** 429: quota della feature raggiunta (giornaliera o settimanale, per piano). */
function sendRateLimited(res: Response, max: number, window: "day" | "week" = "day") {
  const periodo = window === "week" ? "settimanale" : "giornaliero";
  const quando = window === "week" ? "Riprova la prossima settimana o passa a Premium." : "Riprova domani o passa a Premium.";
  return res.status(429).json({
    error: {
      code: "AI_RATE_LIMITED",
      message: `Hai raggiunto il limite ${periodo} (${max}) per questa funzione AI. ${quando}`,
    },
  });
}

/** 503: impossibile verificare la quota (DB non disponibile) — fail-closed. */
function sendUsageUnavailable(res: Response) {
  return res.status(503).json({
    error: {
      code: "AI_USAGE_UNAVAILABLE",
      message: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova più tardi.",
    },
  });
}

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
    const familyId = getParam(req, 'familyId');
    const userId = req.user!.userId;

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

    // Ciò che è già in dispensa non va risuggerito (evita doppioni).
    const pantryRows = await db.select({ name: pantryItems.name })
      .from(pantryItems)
      .where(eq(pantryItems.familyId, familyId))
      .limit(200);
    const pantryNames = pantryRows.map(p => p.name);

    let aiResult: { items: ShoppingSuggestionItem[] } = { items: [] };
    // Prenotazione quota PRIMA di OpenAI. Comportamento specifico di shopping:
    // - "limited": quota giornaliera piena -> 429.
    // - "unavailable": quota non verificabile (DB giù) -> SOLO fallback locale,
    //   nessuna chiamata OpenAI (preferenza esplicita: niente costi non tracciabili).
    // - "ok": chiama OpenAI; sia il successo che il fallimento aggiornano il record
    //   (anche un fallimento ha consumato token).
    const reservation = await reserveAiSlot(userId, familyId, 'shopping-suggestions');
    if (reservation.status === 'limited') {
      return sendRateLimited(res, reservation.max, reservation.window);
    }
    if (reservation.status === 'ok') {
      const usageId = reservation.usageId;
      try {
        aiResult = await generateShoppingSuggestions({
          familySize: members.length || 1,
          season: getCurrentSeason(),
          upcomingEvents: upcomingEvents.map(e => e.title),
          recentPurchases,
          alreadyOnList,
          completedRecently,
          recentSuggestions,
          pantryItems: pantryNames,
        });
        await finalizeAiUsage(usageId, true);
      } catch (aiErr) {
        await finalizeAiUsage(usageId, false);
        // Config mancante: blocca con 503 (nessun senso restituire solo fallback).
        if (isAiError(aiErr) && aiErr.code === 'AI_NOT_CONFIGURED') {
          return sendAiError(res, aiErr, 'Errore nella generazione suggerimenti');
        }
        // Errore provider/timeout: degradiamo al fallback pool senza bloccare l'utente.
        logger.error('Shopping AI failed, using fallback pool', { error: String(aiErr) });
      }
    } else {
      // reservation.status === 'unavailable'
      logger.warn('Shopping: quota non verificabile, uso solo fallback locale (nessuna chiamata OpenAI)');
    }

    const alreadyOnListSet = new Set(alreadyOnList.map(normalizeItemName).filter(n => n.length > 0));
    const completedRecentlySet = new Set(completedRecently.map(normalizeItemName).filter(n => n.length > 0));
    const recentPurchasesSet = new Set(recentPurchases.map(normalizeItemName).filter(n => n.length > 0));
    const recentSuggestionsSet = new Set(recentSuggestions.map(normalizeItemName).filter(n => n.length > 0));
    const pantrySet = new Set(pantryNames.map(normalizeItemName).filter(n => n.length > 0));

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
      if (pantrySet.has(norm)) { continue; }
      filtered.push(item);
    }
    const keptAfterFilters = filtered.length;

    const allForbiddenSet = new Set<string>();
    for (const s of [alreadyOnListSet, completedRecentlySet, recentPurchasesSet, recentSuggestionsSet, pantrySet]) {
      for (const v of s) allForbiddenSet.add(v);
    }
    // NB: non pre-aggiungere seenNames (i nomi degli articoli AI) a allForbiddenSet:
    // addItem rifiuta ciò che è in allForbiddenSet, quindi bloccherebbe gli stessi
    // articoli AI che vogliamo inserire. I duplicati sono già evitati da usedNorms
    // (ogni addItem riuscito aggiunge il nome sia a usedNorms sia a allForbiddenSet).

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
      if (finalItems.filter(i => i.category === 'household_cleaning').length >= 2) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const householdCount1 = finalItems.filter(i => i.category === 'household_cleaning').length;
    if (householdCount1 < 2) {
      const pool = [...FALLBACK_POOL].filter(fb => fb.category === 'household_cleaning').sort(() => Math.random() - 0.5);
      for (const fb of pool) {
        if (finalItems.filter(i => i.category === 'household_cleaning').length >= 2) break;
        if (finalItems.length >= 10) break;
        if (addItem({ ...fb, source: 'fallback' })) {
          selectedFromFallback++;
          fallbackUsedForHouseholdMin++;
        }
      }
    }

    for (const item of personalAI) {
      if (finalItems.filter(i => i.category === 'personal_care').length >= 1) break;
      if (finalItems.length >= 10) break;
      if (addItem(item)) selectedFromAI++;
    }
    const personalCount1 = finalItems.filter(i => i.category === 'personal_care').length;
    if (personalCount1 < 1) {
      const pool = [...FALLBACK_POOL].filter(fb => fb.category === 'personal_care').sort(() => Math.random() - 0.5);
      for (const fb of pool) {
        if (finalItems.filter(i => i.category === 'personal_care').length >= 1) break;
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
    sendAiError(res, error, 'Errore nella generazione suggerimenti');
  }
});

router.get('/:familyId/chore-optimization', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const pendingChores = await db.select()
      .from(chores)
      .where(and(eq(chores.familyId, familyId), eq(chores.isCompleted, false)));

    if (pendingChores.length === 0) {
      return res.json({ assignments: [], message: 'Nessuna faccenda da assegnare' });
    }

    // Minimizzazione: a OpenAI vanno SOLO alias generici ("Membro 1", …),
    // mai i nomi reali dei familiari. L'AI risponde con gli id, quindi il
    // risultato resta corretto senza esporre dati personali.
    const run = await withAiUsage(
      { userId, familyId, feature: 'chore-optimization' },
      () => optimizeChoreSchedule({
        members: members.map((m, i) => ({ id: m.id, name: `Membro ${i + 1}`, points: m.points || 0 })),
        chores: pendingChores.map(c => ({ id: c.id, title: c.title, estimatedMinutes: c.estimatedMinutes || 30 })),
      }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    res.json(run.value);
  } catch (error) {
    logger.error('Chore optimization error', { error: String(error) });
    sendAiError(res, error, "Errore nell'ottimizzazione");
  }
});

// Analisi AI del budget: abitudini di spesa + consigli di risparmio (soggetto a quota).
router.post('/:familyId/budget-insights', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const month = typeof req.body?.month === 'string' && /^\d{4}-\d{2}$/.test(req.body.month)
      ? req.body.month
      : new Date().toISOString().slice(0, 7);

    const { getBudgetSummary } = await import('./expenses');
    const summary = await getBudgetSummary(familyId, month);
    if (!summary) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Mese non valido' } });
    }
    if (summary.total <= 0) {
      return res.json({ insights: [], message: 'Nessuna spesa registrata questo mese: aggiungi qualche spesa per ricevere consigli.' });
    }

    const run = await withAiUsage(
      { userId, familyId, feature: 'budget-insights' },
      () => generateBudgetInsights({
        month: summary.month,
        total: summary.total,
        categories: Object.entries(summary.categories).map(([category, v]) => ({ category, total: v.total, count: v.count })),
        budgets: summary.budgets,
        trend: summary.trend,
      }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    res.json(run.value);
  } catch (error) {
    logger.error('Budget insights error', { error: String(error) });
    sendAiError(res, error, "Errore nell'analisi del budget");
  }
});

router.get('/:familyId/insights', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

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
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
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

    const run = await withAiUsage(
      { userId, familyId, feature: 'insights' },
      () => generateFamilyInsights({
        events: events.length,
        completedChores: completedChores.length,
        pendingChores: pendingChores.length,
        topContributor: topMember?.nickname || 'Nessuno',
        weeklyPoints: completedChores.reduce((sum, c) => sum + (c.points || 0), 0),
      }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);
    const insights = run.value;

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
    sendAiError(res, error, "Errore nella generazione insights");
  }
});

router.patch('/:familyId/insights/:insightId/dismiss', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const insightId = getParam(req, 'insightId');

    await db.update(aiInsights)
      .set({ dismissed: true })
      .where(eq(aiInsights.id, insightId));

    res.json({ message: 'Insight nascosto' });
  } catch (error) {
    logger.error('Dismiss insight error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore" } });
  }
});

/**
 * Sessioni per la generazione incrementale delle ricette: il client avvia la
 * generazione (POST con incremental:true), riceve subito un generationId e poi
 * legge le ricette man mano che i batch arrivano (GET).
 * Persistite su DB (tabella recipe_gen_sessions) così il polling sopravvive a
 * riavvii del backend e funziona anche con più istanze in produzione.
 * La quota AI resta invariata: UNA prenotazione per generazione, il polling
 * non consuma quota. TTL breve perché i dati servono solo durante il polling.
 * updatedAt fa da heartbeat: se una sessione non-done non viene aggiornata da
 * troppo tempo, il processo che la generava è morto (es. riavvio a metà) e il
 * GET la chiude restituendo le ricette parziali già salvate.
 */
const RECIPE_GEN_TTL_MS = 10 * 60 * 1000;
// Ben oltre l'intervallo tra due batch OpenAI: scaduto questo, la generazione
// è considerata interrotta (il processo che scriveva i batch non esiste più).
const RECIPE_GEN_STALE_MS = 90 * 1000;

async function sweepRecipeGenSessions() {
  try {
    const cutoff = new Date(Date.now() - RECIPE_GEN_TTL_MS);
    await db.delete(recipeGenSessions).where(lt(recipeGenSessions.createdAt, cutoff));
  } catch (error) {
    // Best-effort: una sweep fallita non deve bloccare la generazione.
    logger.error('Recipe gen sessions sweep error', { error: String(error) });
  }
}

router.post('/:familyId/recipe-suggestions', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const { dietaryPreferences, allergies, maxTimeMinutes, cuisinePreferences, excludedIngredients, count, excludeTitles } = req.body || {};
    // Allergie/intolleranze = possibili dati salute (art. 9 GDPR): vanno a
    // OpenAI SOLO con il consenso specifico ai_health attivo.
    const allowedAllergies = (await userHasAiHealthConsent(userId)) ? allergies : undefined;

    const existingRecipes = await db.select({ title: recipes.title })
      .from(recipes)
      .where(eq(recipes.familyId, familyId))
      .orderBy(desc(recipes.createdAt))
      .limit(50);
    const dbTitles = existingRecipes.map(r => r.title);
    const extraTitles = Array.isArray(excludeTitles) ? excludeTitles : [];
    const lastRecipeTitles = [...new Set([...dbTitles, ...extraTitles])];

    // Ingredienti già in dispensa: l'AI dà priorità a ricette che li usano.
    const pantryRows = await db.select({ name: pantryItems.name })
      .from(pantryItems)
      .where(eq(pantryItems.familyId, familyId))
      .limit(60);
    const pantryIngredients = pantryRows.map(p => p.name);

    const genContext = {
      familySize: members.length || 1,
      dietaryPreferences,
      allergies: allowedAllergies,
      maxTimeMinutes: maxTimeMinutes || null,
      cuisinePreferences: cuisinePreferences || null,
      excludedIngredients: excludedIngredients || null,
      lastRecipeTitles,
      count: Math.min(count || 8, 20),
      pantryIngredients,
    };

    // Modalità incrementale: risponde subito con un generationId e genera in
    // background; il client legge i batch via GET man mano che arrivano.
    // Quota identica alla modalità classica: una sola prenotazione.
    if (req.body?.incremental === true) {
      void sweepRecipeGenSessions();
      const generationId = crypto.randomUUID();
      // Lista cumulativa in-memory (per dedup) + scritture DB serializzate:
      // ogni batch riscrive la lista completa e aggiorna updatedAt (heartbeat).
      const sessionRecipes: unknown[] = [];
      const seenTitles = new Set<string>();
      let writeChain: Promise<unknown> = Promise.resolve();
      const persistSession = (fields: { done?: boolean; errorStatus?: number; errorBody?: unknown }) => {
        const snapshot = sessionRecipes.slice();
        writeChain = writeChain.then(() =>
          db.update(recipeGenSessions)
            .set({ recipes: snapshot, updatedAt: new Date(), ...fields })
            .where(eq(recipeGenSessions.id, generationId))
        ).catch((error) => {
          logger.error('Recipe gen session persist error', { generationId, error: String(error) });
        });
        return writeChain;
      };
      const appendDeduped = (batch: { title: string }[]) => {
        let added = false;
        for (const r of batch) {
          const norm = r.title.toLowerCase().trim();
          if (seenTitles.has(norm)) continue;
          seenTitles.add(norm);
          sessionRecipes.push(r);
          added = true;
        }
        if (added) void persistSession({});
      };

      let errorFields: { errorStatus?: number; errorBody?: unknown } = {};
      try {
        const run = await withAiUsage(
          { userId, familyId, feature: 'recipe-suggestions' },
          async () => {
            // Registra la sessione SOLO dopo che la quota è stata prenotata,
            // poi rispondi subito: la generazione prosegue in background.
            await db.insert(recipeGenSessions).values({
              id: generationId, userId, familyId, recipes: [], done: false,
            });
            res.status(202).json({ generationId });
            return generateRecipeSuggestions(genContext, appendDeduped);
          },
        );
        if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
        if (run.outcome === 'unavailable') return sendUsageUnavailable(res);
      } catch (error) {
        // La risposta 202 è già partita: l'errore va comunicato via polling.
        logger.error('Incremental recipe generation error', { error: String(error) });
        if (isAiError(error)) {
          errorFields = { errorStatus: error.httpStatus, errorBody: { code: error.code, message: error.userMessage } };
        } else {
          errorFields = { errorStatus: 500, errorBody: { code: 'AI_ERROR', message: 'Errore nella generazione ricette' } };
        }
      }
      await persistSession({ done: true, ...errorFields });
      return;
    }

    const run = await withAiUsage(
      { userId, familyId, feature: 'recipe-suggestions' },
      () => generateRecipeSuggestions(genContext),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);
    const result = run.value;

    const seenTitles = new Set<string>();
    const dedupedRecipes = result.recipes.filter(r => {
      const norm = r.title.toLowerCase().trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });

    res.json({ recipes: dedupedRecipes, generatedAt: new Date().toISOString() });

    // Prewarm in background: le foto mancanti vengono generate subito
    // (titoli già noti), così quando l'utente apre la lista sono in cache.
    prewarmRecipeImages(
      dedupedRecipes.map(r => ({ title: r.title, description: (r as any).description })),
      userId,
      familyId,
    );
  } catch (error) {
    logger.error('Recipe suggestions error', { error: String(error) });
    sendAiError(res, error, "Errore nella generazione ricette");
  }
});

/**
 * Polling della generazione incrementale: restituisce le ricette arrivate
 * finora e il flag done. Non consuma quota AI (la quota è stata prenotata
 * una sola volta all'avvio della generazione).
 */
router.get('/:familyId/recipe-suggestions/:generationId', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const generationId = getParam(req, 'generationId');
  if (!/^[0-9a-f-]{36}$/i.test(generationId)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Generazione non trovata o scaduta' } });
  }
  try {
    const [session] = await db.select().from(recipeGenSessions)
      .where(eq(recipeGenSessions.id, generationId))
      .limit(1);
    if (!session || session.familyId !== familyId || session.userId !== req.user!.userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Generazione non trovata o scaduta' } });
    }
    let { done, recipes: sessionRecipes, errorStatus, errorBody } = session;
    let interrupted = false;
    // Heartbeat scaduto su sessione non conclusa: il processo che generava è
    // morto (riavvio/deploy a metà). Chiudi la sessione in modo atomico
    // (solo se ancora non-done, così non sovrascrive un finale legittimo) e
    // restituisci le ricette parziali già salvate: la quota NON viene
    // riconsumata e l'utente non vede un 404 ambiguo.
    if (!done && Date.now() - session.updatedAt.getTime() > RECIPE_GEN_STALE_MS) {
      // UPDATE condizionato su done=false: se un'altra istanza ha concluso nel
      // frattempo, non sovrascrive il finale legittimo (returning vuoto).
      const closed = await db.update(recipeGenSessions)
        .set({
          done: true,
          errorStatus: sessionRecipes.length === 0 ? 503 : null,
          errorBody: sessionRecipes.length === 0
            ? { code: 'AI_INTERRUPTED', message: 'La generazione si è interrotta per un riavvio del servizio. Riprova più tardi.' }
            : null,
          updatedAt: new Date(),
        })
        .where(and(eq(recipeGenSessions.id, generationId), eq(recipeGenSessions.done, false)))
        .returning({ id: recipeGenSessions.id });
      // Rileggi lo stato finale (nostro o dell'altra istanza).
      const [final] = await db.select().from(recipeGenSessions)
        .where(eq(recipeGenSessions.id, generationId))
        .limit(1);
      if (final) {
        done = final.done;
        sessionRecipes = final.recipes;
        errorStatus = final.errorStatus;
        errorBody = final.errorBody;
      }
      interrupted = closed.length > 0;
    }
    // Errore totale (nessuna ricetta): propaga lo stesso errore tipizzato della
    // modalità classica, così il client mostra il messaggio giusto.
    if (done && errorStatus && sessionRecipes.length === 0) {
      return res.status(errorStatus).json({ error: errorBody });
    }
    // La sessione resta fino al TTL: ripetere il GET dopo done è idempotente
    // (nessun rischio di perdere risposte per un errore di rete del client).
    res.json({ recipes: sessionRecipes, done, interrupted, generatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error('Recipe gen polling error', { generationId, error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella lettura della generazione' } });
  }
});

router.post('/:familyId/weekly-meal-plan', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const startTime = Date.now();
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const { weekStartDate, preferences } = req.body || {};
    // Prima pubblicazione: 1 sola variante per tutti (premium disabilitato).
    // Varianti multiple raddoppierebbero il costo OpenAI a parità di quota.
    const variants = resolveMealPlanVariants((req.body || {}).variants);

    if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "weekStartDate è obbligatorio (YYYY-MM-DD)" } });
    }

    const context = {
      familySize: members.length || 1,
      weekStartDate,
      preferences: await stripHealthDataIfNoConsent(userId, preferences),
    };

    const run = await withAiUsage(
      { userId, familyId, feature: 'weekly-meal-plan' },
      () => generateWeeklyMealPlan({ ...context, planVariant: 1 }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);
    const plan = run.value;
    plan.title = plan.title || "Piano Settimanale";
    const resultPlans: any[] = [{ ...plan, weekStartDate }];

    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      tag: "AI_MEAL_PLAN",
      familyId,
      variants,
      durationMs,
      plans: resultPlans.map(p => ({ title: p.title, itemsCount: p.items?.length || 0 })),
    }));

    res.json({ plans: resultPlans });

    // Prewarm in background: le foto dei pasti sono già note, così l'utente
    // le trova in cache aprendo il piano (stessa quota/dedup dei suggerimenti).
    prewarmRecipeImages(
      (plan.items || []).map((it: any) => ({ title: it.title, description: it.description })),
      userId,
      familyId,
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Weekly meal plan error', { error: String(error), durationMs });
    sendAiError(res, error, "Errore nella generazione del piano pasti");
  }
});

router.post('/:familyId/weekly-meal-plan/stream', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const startTime = Date.now();
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  const { weekStartDate, preferences, planVariant: rawPlanVariant } = req.body || {};
  const planVariant = rawPlanVariant === 2 ? 2 : 1;

  if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "weekStartDate è obbligatorio (YYYY-MM-DD)" } });
  }

  let clientClosed = false;
  req.on('close', () => { clientClosed = true; });

  // Slot quota prenotato: va SEMPRE finalizzato (succeeded/failed), anche se
  // il client si disconnette o il setup dello stream lancia un errore, per non
  // lasciare record "started" orfani che continuerebbero a consumare quota.
  let usageId: string | null = null;
  let usageFinalized = false;
  const finalizeUsageOnce = async (success: boolean) => {
    if (usageId && !usageFinalized) {
      usageFinalized = true;
      await finalizeAiUsage(usageId, success);
    }
  };

  try {
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    // Prenotazione quota PRIMA di aprire lo stream: così su 429/503 possiamo
    // ancora rispondere con uno status HTTP (headers non ancora inviati).
    const reservation = await reserveAiSlot(userId, familyId, 'weekly-meal-plan');
    if (reservation.status === 'limited') return sendRateLimited(res, reservation.max, reservation.window);
    if (reservation.status === 'unavailable') return sendUsageUnavailable(res);
    usageId = reservation.usageId;

    // Se il client si è già disconnesso, non chiamare OpenAI: niente costi inutili.
    // Lo slot prenotato viene marcato "failed" dal finally.
    if (clientClosed) return;

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const plan = await generateWeeklyMealPlan({
      familySize: members.length || 1,
      weekStartDate,
      preferences: await stripHealthDataIfNoConsent(userId, preferences),
      planVariant,
      onProgress: (items) => {
        if (clientClosed) return;
        res.write(JSON.stringify({ type: 'items', items }) + '\n');
      },
    });
    await finalizeUsageOnce(true);

    if (clientClosed) return;

    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      tag: "AI_MEAL_PLAN_STREAM",
      familyId,
      durationMs,
      itemsCount: plan.items.length,
    }));

    res.write(JSON.stringify({
      type: 'done',
      title: plan.title || "Piano Settimanale",
      weekStartDate,
      itemsCount: plan.items.length,
    }) + '\n');
    res.end();

    // Prewarm in background anche per lo stream: titoli già noti a fine piano.
    prewarmRecipeImages(
      (plan.items || []).map((it: any) => ({ title: it.title, description: it.description })),
      userId,
      familyId,
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error('Weekly meal plan stream error', { error: String(error), durationMs });
    if (clientClosed) return;
    if (!res.headersSent) {
      // Errore prima dell'inizio dello stream: rispondi con HTTP status tipizzato.
      sendAiError(res, error, "Errore nella generazione del piano pasti");
    } else {
      const message = isAiError(error) ? error.userMessage : "Errore nella generazione del piano pasti";
      try { res.write(JSON.stringify({ type: 'error', message }) + '\n'); } catch {}
      res.end();
    }
  } finally {
    // Garantisce che lo slot prenotato non resti mai "started": in caso di
    // successo è già "succeeded"; ogni altro percorso (errore, disconnessione,
    // early-return) lo marca "failed". No-op se già finalizzato.
    await finalizeUsageOnce(false);
  }
});

router.post('/:familyId/recipe-search', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const { query, excludeTitles } = req.body || {};

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Inserisci almeno 2 caratteri per la ricerca" } });
    }

    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    const extraTitles = Array.isArray(excludeTitles) ? excludeTitles.filter((t: unknown): t is string => typeof t === 'string') : [];

    const run = await withAiUsage(
      { userId, familyId, feature: 'recipe-search' },
      () => searchRecipesByQuery(query.trim(), {
        familySize: members.length || 1,
        excludeTitles: extraTitles,
      }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);
    const result = run.value;

    const excludeSet = new Set(extraTitles.map(t => t.toLowerCase().trim()));
    const seenTitles = new Set<string>();
    const dedupedRecipes = result.recipes.filter(r => {
      const norm = r.title.toLowerCase().trim();
      if (excludeSet.has(norm) || seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });

    res.json({ recipes: dedupedRecipes, query: query.trim() });

    // Prewarm in background: stessa logica dei suggerimenti ricette.
    prewarmRecipeImages(
      dedupedRecipes.map(r => ({ title: r.title, description: (r as any).description })),
      userId,
      familyId,
    );
  } catch (error) {
    logger.error('Recipe search error', { error: String(error) });
    sendAiError(res, error, "Errore nella ricerca ricette");
  }
});

// ---- Trascrizione vocale (dettatura) ----
// Audio tenuto SOLO in memoria (mai su disco): viene inoltrato a OpenAI e scartato.
const AUDIO_ALLOWED_MIMES = new Set([
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
]);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (~10 min di voce compressa)
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (AUDIO_ALLOWED_MIMES.has(mime)) return cb(null, true);
    cb(new Error('UNSUPPORTED_AUDIO_TYPE'));
  },
});

/**
 * Verifica i magic bytes del buffer: deve corrispondere a un formato audio
 * conosciuto (indipendentemente dal MIME dichiarato dal client, che può
 * essere falsificato). Stesso principio dell'hardening upload della chat.
 */
function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // WAV: "RIFF"...."WAVE"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return true;
  // MP4/M4A container: "ftyp" a offset 4
  if (buf.toString('ascii', 4, 8) === 'ftyp') return true;
  // WebM/Matroska: EBML header 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  // Ogg: "OggS"
  if (buf.toString('ascii', 0, 4) === 'OggS') return true;
  // MP3: tag "ID3" oppure frame sync FF Ex/Fx
  if (buf.toString('ascii', 0, 3) === 'ID3') return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // copre anche AAC ADTS
  return false;
}

/** Estensione file coerente col MIME (OpenAI usa il nome per riconoscere il formato). */
function audioExtension(mime: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/mpeg':
    case 'audio/mp3': return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav': return 'wav';
    case 'audio/webm': return 'webm';
    case 'audio/ogg': return 'ogg';
    default: return 'm4a'; // m4a/mp4/aac
  }
}

router.post('/:familyId/transcribe', authenticate, requireAiEnabled, requireFamilyMember(), (req: Request, res: Response) => {
  audioUpload.single('audio')(req, res, async (uploadErr: unknown) => {
    const familyId = getParam(req, 'familyId');
    const userId = req.user!.userId;
    try {
      if (uploadErr) {
        const msg = uploadErr instanceof Error && uploadErr.message === 'UNSUPPORTED_AUDIO_TYPE'
          ? 'Formato audio non supportato'
          : 'File audio troppo grande o non valido (max 10MB)';
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
      }
      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nessun file audio ricevuto' } });
      }
      if (!looksLikeAudio(file.buffer)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Il file ricevuto non sembra un audio valido' } });
      }

      const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
      const run = await withAiUsage(
        { userId, familyId, feature: 'voice-transcription' },
        () => transcribeAudio({
          buffer: file.buffer,
          filename: `voice.${audioExtension(mime)}`,
          mimeType: mime,
          context: typeof req.body?.context === 'string' ? req.body.context : undefined,
          durationMs: (() => {
            const raw = req.body?.durationMs;
            const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
            return Number.isFinite(n) && n > 0 && n < 10 * 60_000 ? n : undefined;
          })(),
        }),
      );
      if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
      if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

      res.json({ text: run.value.text });
    } catch (error) {
      logger.error('Voice transcription error', { error: String(error) });
      sendAiError(res, error, 'Errore nella trascrizione vocale');
    }
  });
});

// ===== COMPILAZIONE AUTOMATICA EVENTO (testo libero → campi) =====

router.post('/:familyId/parse-event', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrivi l\'evento in una frase' } });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrizione troppo lunga (max 500 caratteri)' } });
    }

    // Data odierna nel fuso degli utenti (Italia) per risolvere le date relative.
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    const weekdayName = new Date().toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'Europe/Rome' });

    // Nomi dei membri per riconoscere l'assegnatario ("per Marco", "assegnalo a Anna").
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    const memberNames = members.map(m => m.nickname).filter((n): n is string => !!n);

    const run = await withAiUsage(
      { userId, familyId, feature: 'event-parse' },
      () => parseEventFromText({ text, todayIso, weekdayName, memberNames }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    // Mappa il nome scelto dall'AI sull'id membro (case-insensitive, solo match esatto).
    const parsed = run.value;
    let assigneeMemberId: string | null = null;
    if (parsed.assigneeName) {
      const target = parsed.assigneeName.trim().toLowerCase();
      const match = members.find(m => (m.nickname || '').trim().toLowerCase() === target);
      if (match) assigneeMemberId = match.id;
    }

    res.json({ ...parsed, assigneeMemberId });
  } catch (error) {
    logger.error('Event parse error', { error: String(error) });
    sendAiError(res, error, 'Errore nella compilazione automatica');
  }
});

// ===== COMPILAZIONE AUTOMATICA FACCENDA (testo libero → campi) =====

router.post('/:familyId/parse-chore', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrivi la faccenda in una frase' } });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrizione troppo lunga (max 500 caratteri)' } });
    }

    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    const weekdayName = new Date().toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'Europe/Rome' });

    // Nomi dei membri per riconoscere l'assegnatario ("per Marco", "tocca a Anna").
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    const memberNames = members.map(m => m.nickname).filter((n): n is string => !!n);

    const run = await withAiUsage(
      { userId, familyId, feature: 'chore-parse' },
      () => parseChoreFromText({ text, todayIso, weekdayName, memberNames }),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    // Mappa il nome scelto dall'AI sull'id membro (case-insensitive, solo match esatto).
    const parsed = run.value;
    let assigneeMemberId: string | null = null;
    if (parsed.assigneeName) {
      const target = parsed.assigneeName.trim().toLowerCase();
      const match = members.find(m => (m.nickname || '').trim().toLowerCase() === target);
      if (match) assigneeMemberId = match.id;
    }

    res.json({ ...parsed, assigneeMemberId });
  } catch (error) {
    logger.error('Chore parse error', { error: String(error) });
    sendAiError(res, error, 'Errore nella compilazione automatica');
  }
});

// ===== COMPILAZIONE AUTOMATICA SPESA (testo libero → importo/categoria) =====

router.post('/:familyId/parse-expense', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrivi la spesa in una frase' } });
    }
    if (text.length > 300) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Descrizione troppo lunga (max 300 caratteri)' } });
    }

    const run = await withAiUsage(
      { userId, familyId, feature: 'expense-parse' },
      () => parseExpenseFromText(text),
    );
    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    res.json(run.value);
  } catch (error) {
    logger.error('Expense parse error', { error: String(error) });
    sendAiError(res, error, 'Errore nella compilazione automatica della spesa');
  }
});

// ===== FOTO RICETTE (gpt-image-1, cache su disco) =====

const recipeImagesDir = path.resolve('uploads', 'recipe-images');
if (!fs.existsSync(recipeImagesDir)) {
  fs.mkdirSync(recipeImagesDir, { recursive: true });
}

// Dedup richieste concorrenti sulla stessa ricetta: una sola generazione
// (e un solo slot di quota) anche se più client chiedono la stessa foto insieme.
// Il valore è la promise del run del "leader", condivisa con i follower
// così ricevono lo stesso esito reale (ok / limited / unavailable / errore AI).
type RecipeImageRun = Awaited<ReturnType<typeof withAiUsage<Buffer>>>;
const inFlightRecipeImages = new Map<string, Promise<RecipeImageRun>>();

/**
 * Avvia (o si aggancia a) la generazione della foto per una ricetta.
 * Condivisa tra la rotta on-demand e il prewarm in background: il dedup
 * in-flight garantisce un solo run (e un solo slot di quota) per titolo.
 * Ritorna { run, isLeader }: isLeader=false se un run era già in corso.
 */
function startRecipeImageGeneration(params: {
  key: string;
  filePath: string;
  title: string;
  description?: string;
  userId: string;
  familyId: string;
}): { run: Promise<RecipeImageRun>; isLeader: boolean } {
  const { key, filePath, title, description, userId, familyId } = params;
  let task = inFlightRecipeImages.get(key);
  const isLeader = !task;
  if (!task) {
    task = (async () => {
      const run = await withAiUsage(
        { userId, familyId, feature: 'recipe-image' as const },
        () => generateRecipeImage({ title, description }),
      );
      if (run.outcome === 'ok') {
        // Ridimensiona e comprime (1024px PNG ~1.5MB -> 512px WebP ~35KB).
        const optimized = await sharp(run.value)
          .resize(512, 512, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();
        // Scrittura atomica: prima file temporaneo, poi rename.
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tmpPath, optimized);
        await fs.promises.rename(tmpPath, filePath);
      }
      return run;
    })();
    inFlightRecipeImages.set(key, task);
    // Rimuovi la entry quando il run termina (successo o errore).
    task.catch(() => undefined).finally(() => inFlightRecipeImages.delete(key));
  }
  return { run: task, isLeader };
}

// Prewarm foto ricette: dopo i suggerimenti, genera in background le foto
// mancanti così l'utente le trova già in cache. Logica pura testata in
// server/lib/recipe-image-prewarm.ts (dipendenze reali iniettate qui).
const prewarmRecipeImages = createRecipeImagePrewarm({
  imagesDir: recipeImagesDir,
  fileExists: (filePath) => fs.existsSync(filePath),
  startGeneration: startRecipeImageGeneration,
  logWarn: (message, meta) => logger.warn(message, meta),
});

/**
 * POST /api/ai/:familyId/recipe-images/resolve
 * Risolve in batch le foto GIÀ in cache per una lista di titoli.
 * Nessuna generazione, nessun consumo di quota: solo lookup su disco.
 * Risposta: { urls: { [titolo]: "/uploads/..." | null } }
 */
router.post('/:familyId/recipe-images/resolve', authenticate, requireAiEnabled, requireFamilyMember(), (req: Request, res: Response) => {
  const raw = req.body?.titles;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Lista titoli non valida' } });
  }
  const urls: Record<string, string | null> = {};
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const title = t.trim();
    if (title.length < 2 || title.length > 200) continue;
    const fileName = `${recipeImageCacheKey(title)}.webp`;
    urls[title] = fs.existsSync(path.join(recipeImagesDir, fileName))
      ? `/uploads/recipe-images/${fileName}`
      : null;
  }
  res.json({ urls });
});

/**
 * POST /api/ai/:familyId/recipe-image
 * Genera (o recupera dalla cache) la foto di una ricetta proposta dall'AI.
 * Cache-hit: nessuna chiamata OpenAI e nessun consumo di quota.
 */
router.post('/:familyId/recipe-image', authenticate, requireAiEnabled, requireFamilyMember(), async (req: Request, res: Response) => {
  const familyId = getParam(req, 'familyId');
  const userId = req.user!.userId;
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 300) : undefined;
    if (title.length < 2 || title.length > 200) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Titolo ricetta non valido' } });
    }

    const key = recipeImageCacheKey(title);
    const fileName = `${key}.webp`;
    const filePath = path.join(recipeImagesDir, fileName);
    const url = `/uploads/recipe-images/${fileName}`;

    // Cache-hit: la foto esiste già, non consuma quota.
    if (fs.existsSync(filePath)) {
      return res.json({ url, cached: true });
    }

    // Se una generazione per la stessa ricetta è già in corso (anche dal
    // prewarm in background), condividila: i follower ricevono lo stesso
    // esito reale del leader, senza consumare quota.
    const { run: task, isLeader } = startRecipeImageGeneration({ key, filePath, title, description, userId, familyId });

    const run = await task;

    if (run.outcome === 'limited') return sendRateLimited(res, run.max, run.window);
    if (run.outcome === 'unavailable') return sendUsageUnavailable(res);

    res.json({ url, cached: !isLeader });
  } catch (error) {
    logger.error('Recipe image generation error', { error: String(error), familyId });
    sendAiError(res, error, "Errore nella generazione dell'immagine");
  }
});

export default router;
