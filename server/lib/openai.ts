import OpenAI from 'openai';
import { z } from 'zod';
import { normalizeItemName } from './normalize';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type SuggestionCategory = 'food' | 'household_cleaning' | 'personal_care' | 'other';

export interface ShoppingSuggestionItem {
  name: string;
  category: SuggestionCategory;
  reason: string;
}

const suggestionItemSchema = z.object({
  name: z.string(),
  category: z.enum(['food', 'household_cleaning', 'personal_care', 'other']).catch('food'),
  reason: z.string(),
});

const suggestionsResponseSchema = z.object({
  items: z.array(suggestionItemSchema),
}).catch({ items: [] });

export async function generateShoppingSuggestions(context: {
  familySize: number;
  season: string;
  upcomingEvents: string[];
  recentPurchases: string[];
  alreadyOnList: string[];
  completedRecently: string[];
  recentSuggestions: string[];
}): Promise<{ items: ShoppingSuggestionItem[] }> {
  const allForbidden = [
    ...context.recentPurchases,
    ...context.alreadyOnList,
    ...context.completedRecently,
    ...context.recentSuggestions,
  ];
  const forbiddenSet = new Set(allForbidden.map(normalizeItemName).filter(n => n.length > 0));

  const forbiddenText = forbiddenSet.size > 0
    ? `\n\nPRODOTTI VIETATI (NON suggerirli, la famiglia li ha già): ${[...forbiddenSet].join(', ')}`
    : '';

  const randomSeed = Math.floor(Math.random() * 100000);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Sei un assistente per la lista della spesa al supermercato italiano.

REGOLE TASSATIVE:
- Genera esattamente 12 prodotti TUTTI DIVERSI tra loro.
- Nomi generici senza brand (es. "detersivo piatti" non "Fairy", "dentifricio" non "Colgate").
- INCLUDI un MIX di categorie:
  - Almeno 3 prodotti "household_cleaning" (pulizia casa: detersivi, spugne, sacchetti, ecc.)
  - Almeno 2 prodotti "personal_care" (igiene personale: shampoo, dentifricio, sapone, ecc.)
  - Il resto "food" (alimentari: frutta, verdura, carne, pesce, latticini, pasta, ecc.)
- Le motivazioni devono essere pratiche e concrete (es. "versatile per primi e contorni", "ricco di proteine"), MAI generiche o banali.
- NON suggerire MAI prodotti presenti nella lista dei vietati.
- Rispondi SOLO con JSON nel formato: {"items": [{"name": "...", "category": "food"|"household_cleaning"|"personal_care"|"other", "reason": "..."}]}`,
      }, {
        role: 'user',
        content: `[seed:${randomSeed}] Famiglia di ${context.familySize} persone. Stagione: ${context.season}.${context.upcomingEvents.length > 0 ? ` Eventi in programma: ${context.upcomingEvents.join(', ')}.` : ''}${forbiddenText}

Genera 12 prodotti da supermercato NUOVI e DIVERSI da quelli vietati.`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      presence_penalty: 0.8,
      frequency_penalty: 0.3,
    });

    const content = response.choices[0].message.content || '{"items": []}';
    const parsed = suggestionsResponseSchema.parse(JSON.parse(content));
    return parsed;
  } catch (error) {
    console.error('OpenAI shopping suggestions error:', error);
    return { items: [] };
  }
}

export async function optimizeChoreSchedule(context: {
  members: Array<{ id: string; name: string; points: number; }>;
  chores: Array<{ id: string; title: string; estimatedMinutes: number; }>;
}) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Sei un organizzatore equo di faccende domestiche. Bilancia le faccende tra i membri della famiglia.',
      }, {
        role: 'user',
        content: `Membri famiglia: ${JSON.stringify(context.members)}. Faccende da assegnare: ${JSON.stringify(context.chores)}. Assegna le faccende in modo equo considerando i punti accumulati. Rispondi con JSON: {"assignments": [{"choreId": "id", "memberId": "id", "reason": "motivazione"}]}`,
      }],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content || '{"assignments": []}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI error:', error);
    return { assignments: [] };
  }
}

export interface RecipeSuggestion {
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  steps: string[];
  tags: { diet?: string[]; allergens?: string[]; cuisine?: string; difficulty?: string };
  ingredients: Array<{ name: string; quantity?: string; unit?: string; category?: string }>;
}

const singleRecipeSchema = z.object({
  title: z.coerce.string(),
  description: z.coerce.string().catch(''),
  servings: z.coerce.number().catch(4),
  prepTimeMinutes: z.coerce.number().catch(15),
  cookTimeMinutes: z.coerce.number().catch(30),
  steps: z.array(z.coerce.string()).catch([]),
  tags: z.object({
    diet: z.array(z.coerce.string()).optional(),
    allergens: z.array(z.coerce.string()).optional(),
    cuisine: z.coerce.string().optional(),
    difficulty: z.coerce.string().optional(),
  }).catch({}),
  ingredients: z.array(z.object({
    name: z.coerce.string(),
    quantity: z.coerce.string().optional(),
    unit: z.coerce.string().optional(),
    category: z.coerce.string().optional(),
    notes: z.coerce.string().optional(),
  }).catchall(z.unknown())).catch([]),
}).catchall(z.unknown());

function sanitizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleanKey = key.replace(/[\s:]+$/g, '').replace(/^[\s:]+/g, '').trim();
      result[cleanKey] = sanitizeKeys(value);
    }
    return result;
  }
  if (typeof obj === 'string') return obj.trim();
  return obj;
}

function parseRecipesResponse(raw: unknown): RecipeSuggestion[] {
  if (!raw || typeof raw !== 'object') return [];
  const sanitized = sanitizeKeys(raw) as Record<string, unknown>;
  const arr = Array.isArray(sanitized.recipes) ? sanitized.recipes : [];
  const results: RecipeSuggestion[] = [];
  for (const item of arr) {
    try {
      const parsed = singleRecipeSchema.parse(item);
      if (parsed.title && (parsed.steps.length > 0 || parsed.ingredients.length > 0)) {
        results.push(parsed as RecipeSuggestion);
      }
    } catch (e) {
      console.error('Skipping malformed recipe:', JSON.stringify(item)?.slice(0, 200), e);
    }
  }
  return results;
}

export async function generateRecipeSuggestions(context: {
  familySize: number;
  dietaryPreferences?: string[] | string;
  allergies?: string[] | string;
  maxTimeMinutes?: number | null;
  cuisinePreferences?: string[] | null;
  excludedIngredients?: string[] | null;
  lastRecipeTitles?: string[];
  count?: number;
}): Promise<{ recipes: RecipeSuggestion[] }> {
  const count = context.count || 8;
  const randomSeed = Math.floor(Math.random() * 100000);

  const dietText = context.dietaryPreferences
    ? `\nDieta: ${Array.isArray(context.dietaryPreferences) ? context.dietaryPreferences.join(', ') : context.dietaryPreferences}.`
    : '';
  const allergyText = context.allergies
    ? `\nAllergie/intolleranze: ${Array.isArray(context.allergies) ? context.allergies.join(', ') : context.allergies}.`
    : '';
  const timeText = context.maxTimeMinutes
    ? `\nTempo massimo di preparazione+cottura: ${context.maxTimeMinutes} minuti.`
    : '';
  const cuisineText = context.cuisinePreferences?.length
    ? `\nCucine preferite: ${context.cuisinePreferences.join(', ')}.`
    : '';
  const excludeText = context.excludedIngredients?.length
    ? `\nIngredienti da ESCLUDERE: ${context.excludedIngredients.join(', ')}.`
    : '';
  const lastTitlesText = context.lastRecipeTitles?.length
    ? `\n\nTITOLI GIÀ GENERATI (NON ripeterli, inventa piatti COMPLETAMENTE diversi): ${context.lastRecipeTitles.join(', ')}`
    : '';

  const allCategories = [
    "pasta", "risotto", "zuppa", "insalata", "carne al forno",
    "pesce", "contorno", "piatto unico vegetariano", "frittata/torta salata",
    "legumi", "pizza/focaccia", "secondo di carne in padella",
    "gnocchi", "polenta", "crostini/bruschetta", "stufato"
  ];
  // Shuffle and pick 'count' categories for variety
  const shuffled = allCategories.sort(() => Math.random() - 0.5);
  const selectedCats = shuffled.slice(0, count);

  async function fetchRecipeBatch(cats: string[], seed: number): Promise<RecipeSuggestion[]> {
    const n = cats.length;
    const catList = cats.join(', ');
    const sysPrompt = `Genera ${n} ricette italiane JSON.{"recipes":[{"title":"nome","description":"10 parole","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["3 passi brevi"],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Categorie:${catList}. Max 5 ingredienti. Passi max 3. Quantity stringa. INVENTA piatti ORIGINALI e DIVERSI ogni volta.`;

    const userMsg = `${seed} ${context.familySize}pers${dietText}${allergyText}${timeText}${cuisineText}${excludeText}${lastTitlesText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
      temperature: 1.2,
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content || '{"recipes": []}';
    console.log(`AI batch (${n} cats): finish=${response.choices[0].finish_reason}, len=${content.length}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('Recipe JSON parse error:', content?.slice(0, 300));
      return [];
    }
    return parseRecipesResponse(parsed);
  }

  try {
    const startTime = Date.now();
    const allRecipes = await fetchRecipeBatch(selectedCats, randomSeed);
    const elapsed = Date.now() - startTime;
    console.log(`Recipe generation: ${allRecipes.length} recipes in ${elapsed}ms (single call)`);

    const seenTitles = new Set<string>();
    const unique = allRecipes.filter(r => {
      const norm = r.title.toLowerCase().trim();
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });

    console.log(`Final recipe count: ${unique.length}`);
    return { recipes: unique };
  } catch (error) {
    console.error('OpenAI recipe suggestions error:', error);
    return { recipes: [] };
  }
}

export interface MealPlanSuggestion {
  title: string;
  items: Array<{
    date: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    title: string;
    description?: string;
  }>;
}

const mealPlanSchema = z.object({
  title: z.string(),
  items: z.array(z.object({
    date: z.string(),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    title: z.string(),
    description: z.string().optional(),
  })),
}).catch({ title: '', items: [] });

export async function generateWeeklyMealPlan(context: {
  familySize: number;
  weekStartDate: string;
  preferences?: { diet?: string; allergies?: string; maxTimeMinutes?: number; mealsPerDay?: number };
  planVariant?: number;
}): Promise<MealPlanSuggestion> {
  const mealsPerDay = context.preferences?.mealsPerDay || 3;
  const mealTypes = mealsPerDay >= 4
    ? ['breakfast', 'lunch', 'dinner', 'snack']
    : mealsPerDay >= 3
      ? ['breakfast', 'lunch', 'dinner']
      : ['lunch', 'dinner'];

  const variant = context.planVariant || 1;
  const variantHint = variant === 1
    ? 'Crea un piano equilibrato e classico con piatti tradizionali italiani.'
    : 'Crea un piano creativo e diverso con piatti più originali e meno convenzionali.';

  const aiStartTime = Date.now();
  try {
    const prefText = context.preferences
      ? `\nPreferenze: ${context.preferences.diet ? `Dieta: ${context.preferences.diet}.` : ''} ${context.preferences.allergies ? `Allergie: ${context.preferences.allergies}.` : ''} ${context.preferences.maxTimeMinutes ? `Tempo max preparazione: ${context.preferences.maxTimeMinutes} min.` : ''}`
      : '';

    const dates: string[] = [];
    const start = new Date(context.weekStartDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]!);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Sei un nutrizionista italiano esperto di piani alimentari familiari.

REGOLE:
- Genera un piano pasti per 7 giorni (da ${dates[0]} a ${dates[6]}).
- Per ogni giorno genera esattamente ${mealsPerDay} pasti: ${mealTypes.join(', ')}.
- Totale items: ${7 * mealsPerDay}.
- Ogni item ha: date (YYYY-MM-DD), mealType (${mealTypes.join('|')}), title (nome piatto in italiano), description (opzionale, breve).
- Bilancia la varietà: non ripetere lo stesso piatto.
- ${variantHint}
- Rispondi con JSON: {"title": "Piano Settimanale [data]", "items": [...]}`,
      }, {
        role: 'user',
        content: `Famiglia di ${context.familySize} persone. Settimana dal ${dates[0]} al ${dates[6]}.${prefText}\n\nGenera il piano pasti settimanale.`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.85,
    });

    const aiDurationMs = Date.now() - aiStartTime;
    const content = response.choices[0].message.content || '{"title":"","items":[]}';

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_PARSE_FAIL", variant, reason: "json_parse", aiDurationMs, rawLength: content.length }));
      return { title: '', items: [] };
    }

    const result = mealPlanSchema.parse(parsed);
    if (!result.items.length) {
      console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_PARSE_FAIL", variant, reason: "empty_items", aiDurationMs }));
    }
    console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_CALL", variant, aiDurationMs, itemsCount: result.items.length }));
    return result;
  } catch (error) {
    const aiDurationMs = Date.now() - aiStartTime;
    console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_PARSE_FAIL", variant, reason: "exception", aiDurationMs, error: String(error) }));
    return { title: '', items: [] };
  }
}

export async function generateFamilyInsights(context: {
  events: number;
  completedChores: number;
  pendingChores: number;
  topContributor: string;
  weeklyPoints: number;
}) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Sei un consulente familiare. Fornisci insight utili basati sui dati.',
      }, {
        role: 'user',
        content: `Dati settimanali famiglia: ${context.events} eventi, ${context.completedChores} faccende completate, ${context.pendingChores} in sospeso. Top contributor: ${context.topContributor} con ${context.weeklyPoints} punti. Genera 3 insight motivanti. Rispondi con JSON: {"insights": [{"title": "titolo", "description": "descrizione", "type": "achievement|suggestion|reminder"}]}`,
      }],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content || '{"insights": []}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI error:', error);
    return { insights: [] };
  }
}
