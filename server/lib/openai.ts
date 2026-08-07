import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { normalizeItemName } from './normalize';
import { AiError, assertAiConfigured, mapOpenAiError, resolveOpenAiConfig } from './ai-errors';

// Client OpenAI LAZY: non creato a livello top-level perché il costruttore del
// SDK lancia se la chiave manca, e ciò impedirebbe l'avvio del server.
// getOpenAiClient() verifica la presenza della chiave (assertAiConfigured) e
// crea il client solo quando serve, riusando l'istanza alle chiamate successive.
let openaiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  assertAiConfigured();
  if (!openaiClient) {
    const { apiKey, baseURL } = resolveOpenAiConfig();
    openaiClient = new OpenAI({
      apiKey,
      // baseURL solo per l'integrazione Replit; con chiave personale si usa
      // l'endpoint ufficiale OpenAI.
      ...(baseURL ? { baseURL } : {}),
      timeout: 60_000,
      maxRetries: 1,
    });
  }
  return openaiClient;
}

/**
 * SOLO PER I TEST: inietta un client fittizio per evitare chiamate reali
 * all'API OpenAI. Passare null per ripristinare il comportamento normale.
 */
export function __setOpenAiClientForTest(client: unknown): void {
  openaiClient = client as OpenAI | null;
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
  pantryItems?: string[];
}): Promise<{ items: ShoppingSuggestionItem[] }> {
  const allForbidden = [
    ...context.recentPurchases,
    ...context.alreadyOnList,
    ...context.completedRecently,
    ...context.recentSuggestions,
    ...(context.pantryItems ?? []),
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
  pantryIngredients?: string[];
}, onBatch?: (recipes: RecipeSuggestion[]) => void): Promise<{ recipes: RecipeSuggestion[] }> {
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
  const pantryText = context.pantryIngredients?.length
    ? `\nINGREDIENTI GIÀ IN DISPENSA (dai priorità a ricette che li usano, per evitare sprechi): ${context.pantryIngredients.slice(0, 40).join(', ')}.`
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

    const userMsg = `${seed} ${context.familySize}pers${dietText}${allergyText}${timeText}${cuisineText}${excludeText}${pantryText}${lastTitlesText}`;

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
    // Primo batch da 1 sola ricetta: l'utente vede il primo risultato in
    // pochi secondi (l'output di 1 ricetta costa ~1/3 dei token di 3).
    // Il resto in batch da 3, tutti in parallelo.
    const BATCH = 3;
    const batches: string[][] = [];
    if (selectedCats.length > 1) batches.push(selectedCats.slice(0, 1));
    for (let i = batches.length ? 1 : 0; i < selectedCats.length; i += BATCH) {
      batches.push(selectedCats.slice(i, i + BATCH));
    }
    const settled = await Promise.allSettled(
      batches.map(async (cats, idx) => {
        const batchRecipes = await fetchRecipeBatch(cats, randomSeed + idx * 7919);
        // Notifica incrementale: il chiamante può mostrare ogni batch appena
        // pronto invece di aspettare tutti i batch. Errori del callback non
        // devono far fallire il batch.
        if (onBatch && batchRecipes.length > 0) {
          try { onBatch(batchRecipes); } catch (e) { console.error('onBatch callback error:', String(e)); }
        }
        return batchRecipes;
      })
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
    // 3 chiamate in parallelo da 1 ricetta ciascuna invece di 1 chiamata da 3:
    // il tempo è dominato dai token di output, quindi il totale scende a ~1/3.
    // Ogni chiamata ha uno stile diverso per evitare doppioni tra parallele.
    // Stili con assi di diversità FORTI ma sempre subordinati alla pertinenza:
    // senza vincoli le 3 chiamate parallele convergono sull'abbinamento più ovvio
    // (es. "code di gamberi" -> 3 varianti di spaghetti con pomodorini), ma i
    // vincoli non devono MAI contraddire la ricerca (es. "pasta" deve dare pasta).
    const styles = [
      'la versione più CLASSICA e tradizionale italiana della richiesta',
      'una versione con INGREDIENTI PRINCIPALI DIVERSI dalla versione classica (es. se la classica usa pomodoro, tu usa verdure, legumi, pesce o formaggi diversi): cambia davvero gli abbinamenti. Usa ingredienti comuni: NIENTE varianti "salutistiche" (integrale, senza glutine, light) se non richieste',
      'una versione CREATIVA o regionale insolita, con TECNICA DI COTTURA DIVERSA dalla classica (es. al forno/gratinata, fredda, ripiena, in padella): sorprendi senza uscire dal tema',
    ];
    const fetchOne = async (style: string, seed: number): Promise<RecipeSuggestion[]> => {
      const response = await getOpenAiClient().chat.completions.create({
        model: 'gpt-5-mini',
        reasoning_effort: 'minimal',
        messages: [
          {
            role: 'system',
            content: `Genera ricette italiane basate sulla richiesta dell'utente. JSON:{"recipes":[{"title":"nome","description":"breve","servings":4,"prepTimeMinutes":10,"cookTimeMinutes":20,"steps":["..."],"tags":{"diet":[],"allergens":[],"cuisine":"italiana","difficulty":"facile"},"ingredients":[{"name":"x","quantity":"200","unit":"g","category":"y"}]}]}
Quantity stringa. Genera esattamente 1 ricetta pertinente alla ricerca (${style}). La ricetta DEVE contenere l'ingrediente cercato.${excludeLine}`,
          },
          {
            role: 'user',
            content: `[s:${seed}] Famiglia ${context.familySize} persone. Cerca: "${query}"`,
          },
        ],
        response_format: RECIPES_RESPONSE_FORMAT,
        max_completion_tokens: 1200,
      });
      const content = response.choices[0].message.content || '{"recipes": []}';
      return parseRecipesResponse(JSON.parse(content));
    };

    const settled = await Promise.allSettled(styles.map((s, i) => fetchOne(s, randomSeed + i * 7919)));
    const recipes: RecipeSuggestion[] = [];
    let firstReason: unknown = null;
    const seen = new Set<string>();
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        for (const r of s.value) {
          const norm = r.title.toLowerCase().trim();
          if (seen.has(norm)) continue;
          seen.add(norm);
          recipes.push(r);
        }
      } else if (firstReason === null) {
        firstReason = s.reason;
      }
    }
    if (recipes.length === 0 && firstReason !== null) throw mapOpenAiError(firstReason);

    const elapsed = Date.now() - startTime;
    console.log(`Recipe search "${query}": ${elapsed}ms, ${recipes.length} recipes (3 parallel calls)`);
    return { recipes };
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

export function parseMealItems(raw: unknown): MealPlanSuggestion['items'] {
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
    : 'Questo è il PIANO B, l\'alternativa al piano classico: proponi piatti DIVERSI nella sostanza (ricette regionali diverse, tecniche di cottura diverse, ingredienti principali diversi), non semplici variazioni di nome o di condimento dei piatti più comuni.';

  const rawNotes = typeof context.preferences?.notes === 'string' ? context.preferences.notes.trim().slice(0, 600) : '';
  // "Dieta mediterranea" senza guida diventa spesso "tanti legumi, poca pasta,
  // poche verdure": ancoriamo la distribuzione settimanale reale della dieta.
  const dietLower = (context.preferences?.diet || '').toLowerCase();
  const mediterraneanRule = dietLower.includes('mediterran')
    ? `\n- DIETA MEDITERRANEA VERA: pasta/riso/cereali come primo quasi ogni giorno a pranzo; verdure o contorno di verdure in OGNI pranzo e cena; pesce 2-3 volte a settimana; legumi al massimo 2-3 volte a settimana (NON di più); carne bianca 1-2 volte; carne rossa al massimo 1 volta; olio extravergine d'oliva e frutta.`
    : '';
  const prefText = context.preferences
    ? `${context.preferences.diet ? ` Dieta: ${context.preferences.diet}.` : ''}${context.preferences.allergies ? ` Allergie: ${context.preferences.allergies}.` : ''}${context.preferences.maxTimeMinutes ? ` Tempo max preparazione: ${context.preferences.maxTimeMinutes} min.` : ''}${rawNotes ? ` Preferenze della famiglia (dettate a voce, seguile con attenzione): ${rawNotes}.` : ''}`
    : '';

  // Piatti tradizionali: il modello tende a "salutizzare" tutto proponendo
  // pasta/pane integrali ovunque. Niente varianti integrali salvo richiesta.
  const wantsWholegrain = dietLower.includes('integral') || rawNotes.toLowerCase().includes('integral');
  const wholegrainRule = wantsWholegrain
    ? ''
    : `\n- Pasta, riso e pane: usa quelli CLASSICI (pasta di semola, riso bianco, pane comune). NON proporre varianti "integrali" a meno che l'utente non le chieda espressamente.`;

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

  // Temi rotanti per giorno: permettono di generare più giorni IN PARALLELO
  // mantenendo la varietà (i giorni della stessa ondata non vedono i titoli
  // l'uno dell'altro, ma temi diversi evitano piatti fotocopia).
  const dayThemes = [
    'privilegia primi di pasta e verdure di stagione',
    'privilegia pesce e piatti leggeri',
    'privilegia carni bianche e contorni',
    'privilegia legumi e piatti vegetariani',
    'privilegia riso, cereali e zuppe',
    'privilegia uova, formaggi e torte salate',
    'privilegia piatti regionali italiani meno comuni',
  ];

  // Dieta mediterranea: temi generici non bastano (il modello scivola su
  // legumi/vegetariano). Qui uno schema settimanale ESPLICITO pranzo/cena
  // che rispecchia la vera piramide mediterranea: pasta quasi ogni pranzo,
  // verdure sempre, pesce 3x, legumi 2x, carne bianca 1-2x, rossa max 1x.
  const mediterraneanDayThemes = [
    'a pranzo pasta con ricotta o sugo di pesce e verdure di stagione più contorno; a cena pesce azzurro (es. alla griglia o al forno) con verdure e pane',
    'a pranzo pasta o riso con sugo di tonno o uova e verdure; a cena una zuppa di legumi con verdure e pane',
    'a pranzo un primo di pasta con proteine (es. pasta e ceci, pasta con ragù bianco); a cena carne bianca (pollo o tacchino) con verdure e patate o farro',
    'a pranzo un piatto unico di cereali (farro, orzo) con formaggio o pesce e verdure; a cena pesce con verdure e pane',
    'a pranzo pasta con sugo di pesce e verdure; a cena uova o formaggio fresco con verdure e pane o patate',
    'a pranzo un primo di riso con proteine o un minestrone con legumi e crostini; a cena insalata o polpette di legumi con verdure e pane',
    'a pranzo pasta al forno o lasagne (con proteine) e contorno; a cena pesce oppure una piccola porzione di carne rossa magra con verdure e patate o pane',
  ];
  // Piano B mediterraneo: stessa piramide (pasta a pranzo, pesce 3x, legumi 2x…)
  // ma piatti concreti diversi dal piano A, altrimenti i due piani si somigliano.
  const mediterraneanDayThemesB = [
    'a pranzo orecchiette o trofie con broccoli/pesto e una fonte proteica; a cena polpo o calamari con patate e verdure',
    'a pranzo risotto ai frutti di mare o alle verdure con formaggio; a cena minestra di lenticchie con verdure e pane',
    'a pranzo pasta alla Norma o con melanzane e ricotta salata; a cena tacchino o coniglio in umido con verdure e pane',
    'a pranzo couscous o orzo con verdure e pesce; a cena pesce spada o salmone alla griglia con verdure e patate',
    'a pranzo gnocchi o pasta fresca con sugo di pesce o formaggio; a cena parmigiana leggera o uova in purgatorio con pane e verdure',
    'a pranzo paella-risotto di verdure o minestrone con farro e crostini; a cena burger o polpette di ceci con verdure e pane',
    'a pranzo cannelloni o gnocchi alla sorrentina; a cena alici al forno oppure una tagliata magra con verdure e patate',
  ];
  const activeDayThemes = mediterraneanRule
    ? (variant === 2 ? mediterraneanDayThemesB : mediterraneanDayThemes)
    : (variant === 2 ? [...dayThemes.slice(3), ...dayThemes.slice(0, 3)] : dayThemes);

  // Anche le colazioni ruotano: senza un tema per giorno il modello propone
  // sempre la stessa colazione generica (es. "latte e biscotti") tutti i giorni.
  const breakfastThemes = [
    'yogurt con frutta fresca e cereali o granola',
    'pane o fette biscottate con marmellata o miele',
    'dolce da forno casalingo (ciambellone, crostata o plumcake) con latte o spremuta',
    'cappuccino o caffellatte con cornetto o brioche',
    'porridge o pancake con frutta',
    'ricotta o formaggio fresco con miele e frutta secca',
    'frullato o smoothie con biscotti secchi',
  ];

  async function fetchChunk(chunkDates: string[], excludeTitles: string[], themeHint?: string, breakfastHint?: string): Promise<MealPlanSuggestion['items']> {
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
- EQUILIBRIO NUTRIZIONALE: ogni pranzo e ogni cena deve essere un pasto COMPLETO con tutti e tre: carboidrati + proteine + verdure.
  - A pranzo il primo deve includere una fonte proteica (es. pasta con legumi/pesce/ragù bianco/uova/formaggio come tonno, ceci, sgombro, ricotta) oppure va aggiunto un secondo leggero: MAI solo pasta al pomodoro senza proteine.
  - A cena, accanto alla fonte proteica, includi SEMPRE una porzione di carboidrati (pane, patate, farro, orzo o riso): MAI solo proteine e verdure.
- Verdure: includi verdure fresche o un contorno di verdure in OGNI pranzo e cena.${mediterraneanRule}${wholegrainRule}
- Includi tutti gli ingredienti necessari. Non ripetere lo stesso piatto nello stesso giorno.${excludeRule}
- ${variantHint}${themeHint ? `\n- Per pranzo e cena di questi giorni ${themeHint}.` : ''}${breakfastHint && mealTypes.includes('breakfast') ? `\n- Per la colazione di questi giorni proponi: ${breakfastHint}. NON ripetere la stessa colazione in giorni diversi.` : ''}
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
  // Ondate di 3 giorni in PARALLELO (7 chiamate seriali → 3 attese):
  // dentro l'ondata la varietà è garantita dai temi rotanti, tra le ondate
  // dai titoli già usati (excludeTitles).
  const WAVE = 3;
  for (let w = 0; w < chunks.length; w += WAVE) {
    const wave = chunks.slice(w, w + WAVE);
    const excludeSnapshot = usedTitles.slice();
    const results = await Promise.allSettled(
      wave.map((chunkDates, i) =>
        fetchChunk(
          chunkDates,
          excludeSnapshot,
          activeDayThemes[(w + i) % activeDayThemes.length],
          breakfastThemes[(w + i) % breakfastThemes.length],
        )
      )
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        failedChunks++;
        if (firstReason === null) firstReason = result.reason;
        console.error('Meal plan chunk failed:', String(result.reason));
        continue;
      }
      const items = result.value;
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
    }
  }

  // Ripassata anti-doppioni: i giorni della stessa ondata non si vedono tra
  // loro, quindi possono capitare piatti identici in giorni diversi. Se
  // succede, UNA sola chiamata extra rigenera i giorni coinvolti e sostituisce
  // solo i piatti doppi; se non trova alternative, il piatto resta (mai buchi).
  const normTitle = (t: string) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Confronto "fuzzy": due titoli sono lo stesso piatto se condividono la
  // maggior parte delle parole significative (es. "Pasta al tonno e pomodorini"
  // ≈ "Spaghetti con tonno e pomodorini"). Stopword e formati di pasta
  // vengono normalizzati prima del confronto (similarità di Jaccard ≥ 0.6).
  const MEAL_STOPWORDS = new Set(['con', 'e', 'ed', 'di', 'del', 'della', 'delle', 'dei', 'al', 'alla', 'alle', 'ai', 'agli', 'allo', 'la', 'il', 'lo', 'le', 'i', 'gli', 'un', 'una', 'uno', 'in', 'su', 'per', 'da', 'fresco', 'fresca', 'freschi', 'fresche', 'misto', 'mista', 'misti', 'miste']);
  const PASTA_SYNONYMS = new Set(['spaghetti', 'penne', 'fusilli', 'rigatoni', 'linguine', 'tagliatelle', 'orecchiette', 'farfalle', 'maccheroni', 'trofie', 'paccheri', 'bucatini', 'mezze', 'maniche', 'caserecce', 'pennette']);
  const titleTokens = (t: string): Set<string> => {
    const out = new Set<string>();
    for (const w of normTitle(t).split(' ')) {
      if (MEAL_STOPWORDS.has(w)) continue;
      if (w.length < 3 && !/^\d+$/.test(w)) continue;
      out.add(PASTA_SYNONYMS.has(w) ? 'pasta' : w);
    }
    return out;
  };
  const sameDish = (a: Set<string>, b: Set<string>): boolean => {
    if (a.size === 0 || b.size === 0) return false;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = a.size + b.size - inter;
    return inter / union >= 0.6;
  };
  const seenTokenSets: Set<string>[] = [];
  const isDupTitle = (title: string): boolean => {
    const toks = titleTokens(title);
    return seenTokenSets.some(s => sameDish(s, toks));
  };
  const markSeen = (title: string) => { seenTokenSets.push(titleTokens(title)); };
  const dupSlots: { date: string; mealType: string }[] = [];
  for (const it of allItems) {
    if (!it.title || !validDates.has(it.date)) continue;
    if (isDupTitle(it.title)) dupSlots.push({ date: it.date, mealType: it.mealType });
    else markSeen(it.title);
  }
  let duplicatesFixed = 0;
  if (dupSlots.length > 0) {
    try {
      const dupDates = Array.from(new Set(dupSlots.map(s => s.date)));
      const replacements = await fetchChunk(dupDates, usedTitles, 'proponi piatti mai citati finora', 'una colazione italiana diversa da quelle già proposte');
      for (const slot of dupSlots) {
        // Sostituisce SOLO l'item doppio di quello slot (titolo già visto).
        const target = allItems.find(it =>
          it.date === slot.date && it.mealType === slot.mealType && it.title && isDupTitle(it.title));
        const candidate = replacements.find(r =>
          r.date === slot.date && r.mealType === slot.mealType && r.title && !isDupTitle(r.title));
        if (candidate && target) {
          Object.assign(target, candidate);
          markSeen(candidate.title!);
          duplicatesFixed++;
        }
      }
    } catch (reason) {
      // Doppione non sostituito: meglio un piatto ripetuto che un pasto mancante.
      console.error('Meal plan dedupe pass failed:', String(reason));
    }
  }

  const filtered = allItems.filter((it) => validDates.has(it.date));
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
  });

  const aiDurationMs = Date.now() - aiStartTime;
  console.log(JSON.stringify({ tag: "AI_MEAL_PLAN_CALL", variant, aiDurationMs, chunks: chunks.length, failedChunks, itemsCount: filtered.length, duplicates: dupSlots.length, duplicatesFixed }));

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
 * Analizza le abitudini di spesa mensili della famiglia e suggerisce risparmi.
 * Riceve i totali per categoria del mese, i tetti di budget e il trend recente.
 */
export async function generateBudgetInsights(context: {
  month: string;
  total: number;
  categories: Array<{ category: string; total: number; count: number }>;
  budgets: Array<{ category: string; monthlyLimit: number }>;
  trend: Array<{ month: string; total: number }>;
}) {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [{
        role: 'system',
        content: 'Sei un consulente finanziario familiare italiano. Analizzi le spese e dai consigli pratici e concreti per risparmiare, in tono amichevole. Rispondi SEMPRE in italiano.',
      }, {
        role: 'user',
        content: `Spese famiglia mese ${context.month}: totale ${context.total.toFixed(2)}€. Per categoria: ${context.categories.map(c => `${c.category} ${c.total.toFixed(2)}€ (${c.count} spese)`).join(', ') || 'nessuna spesa'}. Tetti budget: ${context.budgets.map(b => `${b.category} ${b.monthlyLimit.toFixed(2)}€`).join(', ') || 'nessuno'}. Trend ultimi mesi: ${context.trend.map(t => `${t.month}: ${t.total.toFixed(2)}€`).join(', ')}. Analizza le abitudini di spesa e genera 3-4 consigli concreti per risparmiare, basati sui dati reali (categorie più pesanti, superamenti o rischi di sforare i tetti, andamento del trend). Rispondi con JSON: {"insights": [{"title": "titolo breve", "description": "consiglio pratico (max 2 frasi)", "type": "warning|suggestion|achievement"}]}`,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{"insights": []}';
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
      throw new AiError('AI_BAD_RESPONSE', 'budget-insights: nessun insight generato');
    }
    return parsed;
  } catch (error) {
    throw mapOpenAiError(error);
  }
}

/**
 * Rileva l'"eco del prompt": con audio vuoto o solo rumore, il modello di
 * trascrizione può restituire il prompt di contesto invece del parlato reale.
 * La regola è volutamente conservativa per non scartare dettature legittime
 * brevi (es. "venerdì alle 20"): scatta solo se la trascrizione è lunga e
 * quasi identica al prompt nel suo insieme.
 */
export function isPromptEcho(text: string, prompt: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const textNorm = normalize(text);
  const promptNorm = normalize(prompt);
  if (!textNorm || !promptNorm) return false;

  // Caso 1: la trascrizione è una porzione lunga e contigua del prompt.
  // Le frasi corte (sotto 30 caratteri) non vengono mai scartate.
  if (textNorm.length >= 30 && promptNorm.includes(textNorm)) return true;

  // Caso 2: quasi tutte le parole della trascrizione (lunga) vengono dal
  // prompt E coprono gran parte del prompt stesso (similarità bidirezionale).
  const textWords = textNorm.split(' ');
  if (textWords.length >= 8) {
    const promptWords = promptNorm.split(' ');
    const promptSet = new Set(promptWords);
    const textSet = new Set(textWords);
    const fromPrompt = textWords.filter((w) => promptSet.has(w)).length / textWords.length;
    const coverage = promptWords.filter((w) => textSet.has(w)).length / promptWords.length;
    if (fromPrompt >= 0.9 && coverage >= 0.6) return true;
  }
  return false;
}

/**
 * Trascrive un file audio (voce dell'utente) in testo italiano.
 * Usa l'API audio di OpenAI (gpt-4o-mini-transcribe). Errori sempre tipizzati
 * via mapOpenAiError; la quota è gestita dalla rotta con withAiUsage.
 */
// Soglie "clip breve" per la trascrizione senza prompt (anti-allucinazione).
export const SHORT_CLIP_MAX_DURATION_MS = 2_500;
export const SHORT_CLIP_MAX_BYTES = 15_000;

// Limiti di plausibilità per la durata dichiarata dal client rispetto ai byte
// effettivi del file. La durata arriva dal client e può essere falsa (bug o
// abuso): se il "bitrate implicito" è assurdo, la durata viene ignorata e si
// torna al fallback in byte. I limiti sono volutamente larghi per coprire dal
// webm/opus a basso bitrate (~1 KB/s) fino al WAV stereo non compresso
// (~176 KB/s), senza accettare coppie palesemente impossibili.
export const PLAUSIBLE_MIN_BYTES_PER_SEC = 100;
export const PLAUSIBLE_MAX_BYTES_PER_SEC = 250_000;

/**
 * True se la durata dichiarata è coerente (in senso lato) con la dimensione
 * del file. Durate non finite, nulle o negative sono sempre implausibili.
 */
export function isDurationPlausible(durationMs: unknown, byteLength: number): boolean {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return false;
  }
  const bytesPerSec = byteLength / (durationMs / 1000);
  return bytesPerSec >= PLAUSIBLE_MIN_BYTES_PER_SEC && bytesPerSec <= PLAUSIBLE_MAX_BYTES_PER_SEC;
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  context?: string;
  /** Durata della registrazione in millisecondi, misurata dal client. */
  durationMs?: number;
}): Promise<{ text: string }> {
  assertAiConfigured();
  try {
    const file = await toFile(input.buffer, input.filename, { type: input.mimeType });
    // Il prompt orienta il modello sul lessico atteso (italiano, dominio famiglia)
    // e riduce gli errori su nomi, date e orari. NIENTE frasi d'esempio: il
    // modello le "echeggia" o ne inventa di simili sugli audio brevi.
    const baseHint =
      'Dettatura vocale in italiano per un\'app di famiglia. Trascrivi fedelmente solo le parole pronunciate.';
    const extra = (input.context || '').trim().slice(0, 300);
    // Audio molto brevi (1-2 parole): il contesto fa più danni che benefici,
    // il modello tende ad allucinare parole del dominio ("incontro" al posto
    // di "cena"). Sotto la soglia si trascrive senza alcun prompt.
    // La durata (se il client la fornisce) è il criterio più affidabile: la
    // soglia in byte varia troppo col bitrate del codec (webm/opus vs m4a) e
    // rischia di togliere il contesto anche a frasi normali di 5-10 secondi.
    // La durata viene usata solo se plausibile rispetto ai byte ricevuti:
    // un client malevolo/buggato potrebbe dichiarare durate false per
    // togliere/forzare il contesto. In caso di incoerenza estrema si ignora
    // la durata e si usa il fallback in byte, senza errori per l'utente.
    const hasDuration = isDurationPlausible(input.durationMs, input.buffer.length);
    const isShortClip = hasDuration
      ? (input.durationMs as number) < SHORT_CLIP_MAX_DURATION_MS
      : input.buffer.length < SHORT_CLIP_MAX_BYTES; // fallback: ~2-3s di voce compressa
    const sentPrompt = isShortClip ? '' : (extra ? `${baseHint} ${extra}` : baseHint);
    const response = await getOpenAiClient().audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      language: 'it',
      ...(sentPrompt ? { prompt: sentPrompt } : {}),
    });
    const text = (response.text || '').trim();
    if (sentPrompt && isPromptEcho(text, sentPrompt)) {
      return { text: '' };
    }
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

/**
 * Estrae i campi di un evento calendario da una descrizione in linguaggio
 * naturale (es. "Cena con Marco venerdì alle 20 da Luigi, fino alle 22").
 * Ritorna solo i campi effettivamente presenti nel testo; la quota è gestita
 * dalla rotta con withAiUsage.
 */
const parsedEventSchema = z.object({
  title: z.string().catch(''),
  location: z.string().nullable().catch(null),
  description: z.string().nullable().catch(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().catch(null),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().catch(null),
  repeat: z.enum(['daily', 'weekly', 'monthly']).nullable().catch(null),
  weekdays: z.array(z.number().int().min(1).max(7)).catch([]),
  monthDays: z.array(z.number().int().min(1).max(31)).catch([]),
  assigneeName: z.string().nullable().catch(null),
});

export type ParsedEvent = z.infer<typeof parsedEventSchema>;

export async function parseEventFromText(input: {
  text: string;
  todayIso: string;
  weekdayName: string;
  memberNames?: string[];
}): Promise<ParsedEvent> {
  assertAiConfigured();
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [{
        role: 'system',
        content: `Estrai i dati di un evento calendario da una frase in italiano.

REGOLE:
- Oggi è ${input.todayIso} (${input.weekdayName}), fuso orario Europe/Rome. Risolvi date relative ("domani", "venerdì", "il 15") in date assolute FUTURE (mai nel passato).
- "title": titolo breve e naturale dell'evento (es. "Cena con Marco"), senza data/ora/luogo.
- "location": il luogo se indicato (es. "da Luigi", "in piscina" → "Luigi", "Piscina"), altrimenti null.
- "description": eventuali dettagli extra non coperti dagli altri campi, altrimenti null.
- "date": data in formato YYYY-MM-DD, SOLO se il testo menziona esplicitamente una data o un giorno ("domani", "venerdì", "il 15", "giorno 8"). Se il testo NON contiene alcun riferimento a una data (anche se c'è un orario), "date" DEVE essere null: NON usare mai la data di oggi come default, perché l'utente potrebbe aver già scelto un altro giorno.
- "time": ora di inizio HH:MM (24h), null se non indicata.
- "endTime": ora di fine HH:MM (24h), null se non indicata.
- "repeat": frequenza di ripetizione se l'evento è ricorrente: "daily" (ogni giorno o solo alcuni giorni della settimana, es. "tutti i giorni", "ogni martedì e giovedì"), "weekly" (una volta a settimana in uno o più giorni, es. "ogni settimana il lunedì"), "monthly" (in giorni fissi del mese, es. "il 1° e il 15 di ogni mese"). null se l'evento non si ripete.
- "weekdays": con repeat "daily" o "weekly", i giorni della settimana come numeri ISO (1=lunedì, 2=martedì, 3=mercoledì, 4=giovedì, 5=venerdì, 6=sabato, 7=domenica), es. "ogni martedì e giovedì" → [2,4]. Altrimenti [].
- "monthDays": con repeat "monthly", i giorni del mese (1-31), es. "il 1° e il 15" → [1,15]. Altrimenti [].
- Se l'utente dice "ogni <giorno>" (es. "ogni martedì e giovedì") usa repeat "weekly" con i weekdays indicati.
- Con "repeat", "date" è la PRIMA occorrenza futura coerente con la regola (es. il prossimo martedì).
${memberList.length > 0 ? `- "assigneeName": se il testo dice a chi è assegnato/di chi è l'evento (es. "per Marco", "assegnalo a Anna", "porta Luca a calcio"), scegli il nome ESATTO più vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde. Un nome citato solo come compagnia (es. "cena CON Marco") non è un assegnatario a meno che non sia nella lista e il contesto lo suggerisca.` : '- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"title": "...", "location": ..., "description": ..., "date": ..., "time": ..., "endTime": ..., "repeat": ..., "weekdays": [...], "monthDays": [...], "assigneeName": ...}`,
      }, {
        role: 'user',
        content: input.text,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = parsedEventSchema.parse(JSON.parse(content));

    // Risposta inutilizzabile (nessun campo compilabile): errore tipizzato,
    // così il client non mostra un falso successo senza compilare nulla.
    const hasUsefulField = parsed.title.trim().length > 0
      || parsed.location || parsed.description || parsed.date || parsed.time || parsed.endTime
      || parsed.repeat || parsed.assigneeName;
    if (!hasUsefulField) {
      throw new AiError('AI_BAD_RESPONSE', 'parse-event: nessun campo estratto dal testo');
    }

    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}

/**
 * Estrae i campi di una faccenda domestica da una descrizione in linguaggio
 * naturale (es. "Butta la spazzatura ogni martedì e giovedì, 10 punti, per Anna").
 * La quota è gestita dalla rotta con withAiUsage.
 */
const parsedChoreSchema = z.object({
  title: z.string().catch(''),
  description: z.string().nullable().catch(null),
  points: z.number().int().min(1).max(100).nullable().catch(null),
  difficulty: z.number().int().min(1).max(5).nullable().catch(null),
  estimatedMinutes: z.number().int().min(1).max(600).nullable().catch(null),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  repeat: z.enum(['daily', 'weekly', 'monthly']).nullable().catch(null),
  weekdays: z.array(z.number().int().min(1).max(7)).catch([]),
  monthDays: z.array(z.number().int().min(1).max(31)).catch([]),
  assigneeName: z.string().nullable().catch(null),
});

export type ParsedChore = z.infer<typeof parsedChoreSchema>;

export async function parseChoreFromText(input: {
  text: string;
  todayIso: string;
  weekdayName: string;
  memberNames?: string[];
}): Promise<ParsedChore> {
  assertAiConfigured();
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [{
        role: 'system',
        content: `Estrai i dati di una faccenda domestica da una frase in italiano.

REGOLE:
- Oggi è ${input.todayIso} (${input.weekdayName}), fuso orario Europe/Rome. Risolvi date relative ("domani", "venerdì") in date assolute FUTURE (mai nel passato).
- "title": titolo breve e naturale della faccenda (es. "Buttare la spazzatura"), senza punti/giorni/assegnatario.
- "description": eventuali dettagli extra non coperti dagli altri campi, altrimenti null.
- "points": i punti se indicati (es. "vale 15 punti" → 15), numero intero 1-100, altrimenti null.
- "difficulty": difficoltà 1-5 solo se indicata esplicitamente (es. "difficoltà 4", "molto difficile" → 5, "facilissima" → 1), altrimenti null.
- "estimatedMinutes": durata stimata in minuti se indicata (es. "ci vuole mezz'ora" → 30), altrimenti null.
- "dueDate": data di scadenza YYYY-MM-DD SOLO se il testo menziona esplicitamente una scadenza singola; null se il testo non contiene riferimenti a una data (NON usare la data di oggi come default) o se la faccenda è ricorrente.
- "repeat": frequenza se la faccenda è ricorrente: "daily" (ogni giorno o alcuni giorni della settimana), "weekly" (una volta a settimana in uno o più giorni, es. "ogni martedì e giovedì"), "monthly" (giorni fissi del mese, es. "il 1° e il 15 di ogni mese"). null se non si ripete.
- "weekdays": con repeat "daily" o "weekly", i giorni della settimana come numeri ISO (1=lunedì ... 7=domenica), es. "ogni martedì e giovedì" → [2,4]. Altrimenti [].
- "monthDays": con repeat "monthly", i giorni del mese (1-31), es. "il 1° e il 15" → [1,15]. Altrimenti [].
- Se l'utente dice "ogni <giorno>" usa repeat "weekly" con i weekdays indicati.
${memberList.length > 0 ? `- "assigneeName": se il testo dice a chi è assegnata la faccenda (es. "per Marco", "tocca a Anna", "assegnala a Luca"), scegli il nome ESATTO più vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde.` : '- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"title": "...", "description": ..., "points": ..., "difficulty": ..., "estimatedMinutes": ..., "dueDate": ..., "repeat": ..., "weekdays": [...], "monthDays": [...], "assigneeName": ...}`,
      }, {
        role: 'user',
        content: input.text,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = parsedChoreSchema.parse(JSON.parse(content));

    // Risposta inutilizzabile: errore tipizzato per evitare un falso successo.
    const hasUsefulField = parsed.title.trim().length > 0
      || parsed.description || parsed.points || parsed.difficulty || parsed.estimatedMinutes
      || parsed.dueDate || parsed.repeat || parsed.assigneeName;
    if (!hasUsefulField) {
      throw new AiError('AI_BAD_RESPONSE', 'parse-chore: nessun campo estratto dal testo');
    }

    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}

/**
 * Estrae una spesa dal linguaggio naturale (es. "fatti 50 euro di benzina"):
 * importo, categoria canonica e descrizione breve. La quota è gestita dalla
 * rotta con withAiUsage.
 */
const parsedExpenseSchema = z.object({
  amount: z.number().positive().max(1000000).nullable().catch(null),
  category: z
    .enum(['alimentari', 'trasporti', 'svago', 'salute', 'casa', 'abbigliamento', 'istruzione', 'altro'])
    .nullable()
    .catch(null),
  description: z.string().nullable().catch(null),
});

export type ParsedExpense = z.infer<typeof parsedExpenseSchema>;

export async function parseExpenseFromText(text: string): Promise<ParsedExpense> {
  assertAiConfigured();
  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: 'gpt-5-mini',
      reasoning_effort: 'minimal',
      messages: [{
        role: 'system',
        content: `Estrai una spesa familiare da una frase in italiano.

REGOLE:
- "amount": importo in euro come numero (es. "50 euro", "24,50€" → 50, 24.5). null se non indicato.
- "category": UNA tra: "alimentari" (spesa, supermercato, cibo), "trasporti" (benzina, carburante, treno, bus, autostrada, parcheggio, auto), "svago" (cinema, ristorante, pizza fuori, giochi, sport), "salute" (farmacia, medico, dentista), "casa" (mobili, riparazioni, giardino, detersivi), "abbigliamento" (vestiti, scarpe), "istruzione" (scuola, libri, corsi), "altro" (tutto il resto). null se non deducibile.
- "description": descrizione breve e naturale della spesa (es. "Benzina"), senza importo. null se non c'è nulla di utile.
- Rispondi SOLO con JSON: {"amount": ..., "category": ..., "description": ...}`,
      }, {
        role: 'user',
        content: text,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = parsedExpenseSchema.parse(JSON.parse(content));

    // Senza importo né categoria la risposta è inutilizzabile: errore tipizzato
    // per evitare un falso successo lato client.
    if (parsed.amount === null && parsed.category === null) {
      throw new AiError('AI_BAD_RESPONSE', 'parse-expense: nessun campo estratto dal testo');
    }

    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}
