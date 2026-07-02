import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { normalizeItemName } from './normalize';
import { assertAiConfigured, mapOpenAiError } from './ai-errors';

// Client OpenAI LAZY: non creato a livello top-level perché il costruttore del
// SDK lancia se la chiave manca, e ciò impedirebbe l'avvio del server.
// getOpenAiClient() verifica la presenza della chiave (assertAiConfigured) e
// crea il client solo quando serve, riusando l'istanza alle chiamate successive.
let openaiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  assertAiConfigured();
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      // baseURL opzionale: impostato solo se realmente configurato
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
        ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
        : {}),
      timeout: 60_000,
      maxRetries: 1,
    });
  }
  return openaiClient;
}

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

  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [{
        role: 'system',
        content: `Sei un assistente per la lista della spesa al supermercato italiano.

REGOLE TASSATIVE:
- Genera esattamente 12 prodotti TUTTI DIVERSI tra loro.
- Nomi generici senza brand (es. "detersivo piatti" non "Fairy", "dentifricio" non "Colgate").
- INCLUDI un MIX di categorie, dando PRIORITÀ agli alimentari di base di uso quotidiano:
  - Almeno 7 prodotti "food" (alimentari), privilegiando i beni essenziali per una famiglia: latte, pane, pasta, riso, uova, frutta, verdura, carne, pesce, latticini.
  - Almeno 2 prodotti "household_cleaning" (pulizia casa: detersivi, spugne, sacchetti, ecc.)
  - Almeno 1 prodotto "personal_care" (igiene personale: shampoo, dentifricio, sapone, ecc.)
- Le motivazioni devono essere pratiche e concrete (es. "versatile per primi e contorni", "ricco di proteine"), MAI generiche o banali.
- NON suggerire MAI prodotti presenti nella lista dei vietati.
- Rispondi SOLO con JSON nel formato: {"items": [{"name": "...", "category": "food"|"household_cleaning"|"personal_care"|"other", "reason": "..."}]}`,
      }, {
        role: 'user',
        content: `[seed:${randomSeed}] Famiglia di ${context.familySize} persone. Stagione: ${context.season}.${context.upcomingEvents.length > 0 ? ` Eventi in programma: ${context.upcomingEvents.join(', ')}.` : ''}${forbiddenText}

Genera 12 prodotti da supermercato NUOVI e DIVERSI da quelli vietati.`,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{"items": []}';
    const parsed = suggestionsResponseSchema.parse(JSON.parse(content));
    return parsed;
  } catch (error) {
    throw mapOpenAiError(error);
  }
}

export async function optimizeChoreSchedule(context: {
  members: Array<{ id: string; name: string; points: number; }>;
  chores: Array<{ id: string; title: string; estimatedMinutes: number; }>;
}) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
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
    throw mapOpenAiError(error);
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

const RECIPES_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'recipes_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recipes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              servings: { type: 'integer' },
              prepTimeMinutes: { type: 'integer' },
              cookTimeMinutes: { type: 'integer' },
              steps: { type: 'array', items: { type: 'string' } },
              tags: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  diet: { type: 'array', items: { type: 'string' } },
                  allergens: { type: 'array', items: { type: 'string' } },
                  cuisine: { type: 'string' },
                  difficulty: { type: 'string' },
                },
                required: ['diet', 'allergens', 'cuisine', 'difficulty'],
              },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'string' },
                    unit: { type: 'string' },
                    category: { type: 'string' },
                  },
                  required: ['name', 'quantity', 'unit', 'category'],
                },
              },
            },
            required: ['title', 'description', 'servings', 'prepTimeMinutes', 'cookTimeMinutes', 'steps', 'tags', 'ingredients'],
          },
        },
      },
      required: ['recipes'],
    },
  },
};

const MEAL_PLAN_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'meal_plan_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              date: { type: 'string' },
              mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
              title: { type: 'string' },
              description: { type: 'string' },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'string' },
                    unit: { type: 'string' },
                  },
                  required: ['name', 'quantity', 'unit'],
                },
              },
              steps: { type: 'array', items: { type: 'string' } },
            },
            required: ['date', 'mealType', 'title', 'description', 'ingredients', 'steps'],
          },
        },
      },
      required: ['items'],
    },
  },
};

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
    const sysPrompt = `Genera ${n} ricette italiane JSON.{"recipes":[{"title":"nome","description":"breve","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["..."],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Categorie:${catList}. Quantity stringa. INVENTA piatti ORIGINALI e DIVERSI ogni volta.`;

    const userMsg = `${seed} ${context.familySize}pers${dietText}${allergyText}${timeText}${cuisineText}${excludeText}${lastTitlesText}`;

    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      response_format: RECIPES_RESPONSE_FORMAT,
      max_completion_tokens: 2500,
    });

    const content = response.choices[0].message.content || '{"recipes": []}';
    console.log(`AI batch (${n} cats): finish=${response.choices[0].finish_reason}, len=${content.length}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Recipe JSON parse error:', content?.slice(0, 300));
      throw mapOpenAiError(e);
    }
    return parseRecipesResponse(parsed);
  }

  assertAiConfigured();
  try {
    const startTime = Date.now();
    const BATCH = 3;
    const batches: string[][] = [];
    for (let i = 0; i < selectedCats.length; i += BATCH) {
      batches.push(selectedCats.slice(i, i + BATCH));
    }
    const settled = await Promise.allSettled(
      batches.map((cats, idx) => fetchRecipeBatch(cats, randomSeed + idx * 7919))
    );
    const allRecipes: RecipeSuggestion[] = [];
    let firstReason: unknown = null;
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        allRecipes.push(...s.value);
      } else {
        if (firstReason === null) firstReason = s.reason;
        console.error('Recipe batch failed:', String(s.reason));
      }
    }
    // Se tutti i batch sono falliti, propaga l'errore tipizzato invece di restituire vuoto.
    if (allRecipes.length === 0 && firstReason !== null) {
      throw mapOpenAiError(firstReason);
    }
    const elapsed = Date.now() - startTime;
    console.log(`Recipe generation: ${allRecipes.length} recipes in ${elapsed}ms (${batches.length} parallel batches)`);

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
    throw mapOpenAiError(error);
  }
}

export async function searchRecipesByQuery(query: string, context: {
  familySize: number;
  excludeTitles?: string[];
}): Promise<{ recipes: RecipeSuggestion[] }> {
  const randomSeed = Math.floor(Math.random() * 100000);
  const excludeList = (context.excludeTitles || []).slice(-30);
  const excludeLine = excludeList.length > 0
    ? ` Evita di riproporre queste ricette già mostrate: ${excludeList.join(', ')}.`
    : '';
  assertAiConfigured();
  try {
    const startTime = Date.now();
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [
        {
          role: 'system',
          content: `Genera ricette italiane basate sulla richiesta dell'utente. JSON:{"recipes":[{"title":"nome","description":"breve","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["..."],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Quantity stringa. Genera esattamente 3 ricette pertinenti alla ricerca. Ogni ricetta DEVE contenere l'ingrediente cercato.${excludeLine}`,
        },
        {
          role: 'user',
          content: `[s:${randomSeed}] Famiglia ${context.familySize} persone. Cerca: "${query}"`,
        },
      ],
      response_format: RECIPES_RESPONSE_FORMAT,
      max_completion_tokens: 2500,
    });

    const content = response.choices[0].message.content || '{"recipes": []}';
    const elapsed = Date.now() - startTime;
    console.log(`Recipe search "${query}": ${elapsed}ms, len=${content.length}`);

    const parsed: unknown = JSON.parse(content);
    return { recipes: parseRecipesResponse(parsed) };
  } catch (error) {
    throw mapOpenAiError(error);
  }
}

export interface MealPlanIngredient {
  name: string;
  quantity?: string;
  unit?: string;
}

export interface MealPlanSuggestion {
  title: string;
  items: Array<{
    date: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    title: string;
    description?: string;
    ingredients?: MealPlanIngredient[];
    steps?: string[];
  }>;
}

const mealPlanIngredientSchema = z.object({
  name: z.coerce.string(),
  quantity: z.coerce.string().optional(),
  unit: z.coerce.string().optional(),
}).catchall(z.unknown());

const mealItemSchema = z.object({
  date: z.coerce.string(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  title: z.coerce.string(),
  description: z.coerce.string().optional(),
  ingredients: z.array(mealPlanIngredientSchema).optional().catch([]),
  steps: z.array(z.coerce.string()).optional().catch([]),
}).catchall(z.unknown());

function parseMealItems(raw: unknown): MealPlanSuggestion['items'] {
  if (!raw || typeof raw !== 'object') return [];
  const sanitized = sanitizeKeys(raw) as Record<string, unknown>;
  const arr = Array.isArray(sanitized.items) ? sanitized.items : [];
  const results: MealPlanSuggestion['items'] = [];
  for (const item of arr) {
    try {
      const parsed = mealItemSchema.parse(item);
      if (parsed.title && parsed.date) {
        results.push(parsed as MealPlanSuggestion['items'][number]);
      }
    } catch {
      // skip malformed item
    }
  }
  return results;
}

export async function generateWeeklyMealPlan(context: {
  familySize: number;
  weekStartDate: string;
  preferences?: { diet?: string; allergies?: string; maxTimeMinutes?: number; mealsPerDay?: number; notes?: string };
  planVariant?: number;
  onProgress?: (items: MealPlanSuggestion['items']) => void;
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

  const rawNotes = typeof context.preferences?.notes === 'string' ? context.preferences.notes.trim().slice(0, 600) : '';
  const prefText = context.preferences
    ? `${context.preferences.diet ? ` Dieta: ${context.preferences.diet}.` : ''}${context.preferences.allergies ? ` Allergie: ${context.preferences.allergies}.` : ''}${context.preferences.maxTimeMinutes ? ` Tempo max preparazione: ${context.preferences.maxTimeMinutes} min.` : ''}${rawNotes ? ` Preferenze della famiglia (dettate a voce, seguile con attenzione): ${rawNotes}.` : ''}`
    : '';

  const dates: string[] = [];
  const start = new Date(context.weekStartDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]!);
  }

  const CHUNK = 1;
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += CHUNK) {
    chunks.push(dates.slice(i, i + CHUNK));
  }

  const mealOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

  async function fetchChunk(chunkDates: string[], excludeTitles: string[]): Promise<MealPlanSuggestion['items']> {
    const excludeRule = excludeTitles.length
      ? `\n- VARIETÀ OBBLIGATORIA: questi piatti sono GIÀ stati pianificati in altri giorni della settimana, quindi NON riproporli e NON proporne di simili: ${excludeTitles.join('; ')}. Scegli piatti chiaramente DIVERSI per ogni pasto.`
      : '';
    const sysPrompt = `Sei un nutrizionista italiano. Genera i pasti SOLO per questi giorni: ${chunkDates.join(', ')}.
REGOLE:
- Per ogni giorno genera esattamente ${mealsPerDay} pasti: ${mealTypes.join(', ')}.
- Ogni item ha: date (una YYYY-MM-DD tra quelle indicate), mealType (${mealTypes.join('|')}), title (nome piatto in italiano), description (breve), ingredients (array), steps (array).
- Ogni ingrediente ha: name (italiano), quantity (stringa, es. "200"), unit (es. "g", "ml", "pezzi").
- steps è la RICETTA passo-passo: da 3 a 6 passaggi brevi e chiari in italiano per preparare il piatto (ogni passaggio è una stringa, senza numerazione iniziale).
- IMPORTANTE: ogni piatto DEVE essere adatto al suo tipo di pasto secondo le abitudini italiane:
  - breakfast (colazione): SOLO colazione italiana tipica, dolce e leggera. Es. cappuccino e cornetto, latte e biscotti, fette biscottate con marmellata, yogurt con cereali e frutta, pane con marmellata o miele, crostata, ciambellone, pancake, porridge, spremuta con plumcake. MAI piatti salati come pasta, carne, pesce, verdure cotte o bruschette salate.
  - lunch (pranzo): pasto principale completo (es. primo di pasta/riso o piatto unico con contorno).
  - dinner (cena): pasto più leggero del pranzo (es. secondo di carne/pesce/uova/legumi con verdure, zuppe, minestre).
  - snack (spuntino): piccolo e leggero (es. frutta, yogurt, frutta secca, una merenda).
- Includi tutti gli ingredienti necessari. Non ripetere lo stesso piatto nello stesso giorno.${excludeRule}
- ${variantHint}
- Rispondi SOLO con JSON: {"items":[{"date":"YYYY-MM-DD","mealType":"...","title":"...","description":"...","ingredients":[{"name":"...","quantity":"...","unit":"..."}],"steps":["passaggio 1","passaggio 2","passaggio 3"]}]}`;
    const userMsg = `Famiglia di ${context.familySize} persone.${prefText}`;

    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userMsg },
      ],
      response_format: MEAL_PLAN_RESPONSE_FORMAT,
      max_completion_tokens: 4000,
    });

    const content = response.choices[0].message.content || '{"items":[]}';
    const parsed: unknown = JSON.parse(content);
    return parseMealItems(parsed);
  }

  assertAiConfigured();
  const validDates = new Set(dates);

  const aiStartTime = Date.now();
  const allItems: MealPlanSuggestion['items'] = [];
  const usedTitles: string[] = [];
  let failedChunks = 0;
  let firstReason: unknown = null;
  for (const chunkDates of chunks) {
    try {
      const items = await fetchChunk(chunkDates, usedTitles);
      allItems.push(...items);
      for (const it of items) {
        if (it.title) usedTitles.push(it.title);
      }
      if (context.onProgress) {
        const dayItems = items
          .filter((it) => validDates.has(it.date))
          .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
          });
        if (dayItems.length) {
          try { context.onProgress(dayItems); } catch {}
        }
      }
    } catch (reason) {
      failedChunks++;
      if (firstReason === null) firstReason = reason;
      console.error('Meal plan chunk failed:', String(reason));
    }
  }

  const filtered = allItems.filter((it) => validDates.has(it.date));
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
  });

  const aiDurationMs = Date.now() - aiStartTime;
  console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_CALL", variant, aiDurationMs, chunks: chunks.length, failedChunks, itemsCount: filtered.length }));

  // Se non è stato generato nessun pasto valido e c'è stato un errore, propagalo tipizzato.
  if (filtered.length === 0 && firstReason !== null) {
    throw mapOpenAiError(firstReason);
  }

  return { title: 'Piano Settimanale', items: filtered };
}

export async function generateFamilyInsights(context: {
  events: number;
  completedChores: number;
  pendingChores: number;
  topContributor: string;
  weeklyPoints: number;
}) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
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
    throw mapOpenAiError(error);
  }
}

/**
 * Trascrive un file audio (voce dell'utente) in testo italiano.
 * Usa l'API audio di OpenAI (gpt-4o-mini-transcribe). Errori sempre tipizzati
 * via mapOpenAiError; la quota è gestita dalla rotta con withAiUsage.
 */
export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<{ text: string }> {
  assertAiConfigured();
  try {
    const file = await toFile(input.buffer, input.filename, { type: input.mimeType });
    const response = await getOpenAiClient().audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      language: 'it',
    });
    const text = (response.text || '').trim();
    return { text };
  } catch (error) {
    throw mapOpenAiError(error);
  }
}

/**
 * Genera una foto realistica di una ricetta con gpt-image-1 (qualità low per
 * contenere i costi). Ritorna il PNG come Buffer, pronto per essere salvato su
 * disco e servito staticamente da /uploads.
 */
export async function generateRecipeImage(input: {
  title: string;
  description?: string;
}): Promise<Buffer> {
  assertAiConfigured();
  try {
    const details = input.description ? ` ${input.description}` : '';
    const prompt =
      `Fotografia food professionale del piatto italiano "${input.title}".${details} ` +
      `Piatto ben impiattato su un tavolo, luce naturale, inquadratura dall'alto leggermente angolata, ` +
      `sfondo semplice e pulito, aspetto appetitoso e realistico. Nessun testo, nessuna scritta, nessuna persona.`;
    const response = await getOpenAiClient().images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'low',
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Nessuna immagine generata');
    }
    return Buffer.from(b64, 'base64');
  } catch (error) {
    throw mapOpenAiError(error);
  }
}
