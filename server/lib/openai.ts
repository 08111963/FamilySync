import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { normalizeItemName } from './normalize';
import {
  AiError,
  assertAiConfigured,
  mapOpenAiError,
  resolveOpenAiConfig,
  type AiProvider,
} from './ai-errors';
import {
  buildMealPlanConstraintPrompt,
  hasMealPlanConstraints,
  mealPlanHasDietaryPattern,
  mealPlanHasExclusion,
  mealPlanRequiresMediterraneanRedMeat,
  mealPlanRequiresGlutenFree,
  unsupportedMealPlanHealthNote,
  validateMealPlanConstraints,
  type MealPlanConstraintViolation,
} from './meal-plan-constraints';
import { recordMealPlanLatency } from './meal-plan-latency-monitor';
import {
  buildMealPlanVarietyContext,
  evaluateMediterraneanMealPlan,
  evaluateMealPlanRedMeat,
  evaluateMealPlanVariety,
  mealPlanLunchSemanticSignature,
  planMealPlanLunchFamilies,
  planMealPlanLunchSemanticTargets,
} from './meal-plan-variety';
import {
  MEAL_PLAN_MAX_GENERATION_ATTEMPTS,
  MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
} from '../../shared/meal-plan-generation-timeouts';
import {
  normalizeMealPlanDietProfile,
} from '../../shared/meal-plan-diet-profiles';

// Client OpenAI LAZY: non creato a livello top-level perché il costruttore del
// SDK lancia se la chiave manca, e ciò impedirebbe l'avvio del server.
// Ogni provider ha la propria cache: una richiesta admin non può riutilizzare
// il client Replit di un altro utente (e viceversa). Il provider è passato
// esplicitamente dalle rotte; il default è Replit per job/background.
const openaiClients: Partial<Record<AiProvider, OpenAI>> = {};

function getOpenAiClient(provider: AiProvider = "replit_managed"): OpenAI {
  assertAiConfigured(provider);
  if (!openaiClients[provider]) {
    const { apiKey, baseURL } = resolveOpenAiConfig(provider);
    openaiClients[provider] = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      timeout: MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return openaiClients[provider]!;
}

/**
 * SOLO PER I TEST: inietta un client fittizio per evitare chiamate reali
 * all'API OpenAI. Passare null per ripristinare il comportamento normale.
 */
export function __setOpenAiClientForTest(
  client: unknown,
  provider: AiProvider = "replit_managed",
): void {
  if (client) {
    openaiClients[provider] = client as OpenAI;
  } else {
    delete openaiClients[provider];
  }
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
  provider?: AiProvider;
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

  assertAiConfigured(context.provider);
  try {
    const response = await getOpenAiClient(context.provider).chat.completions.create({
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
  provider?: AiProvider;
}) {
  assertAiConfigured(context.provider);
  try {
    const response = await getOpenAiClient(context.provider).chat.completions.create({
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
              title: { type: 'string', minLength: 1, maxLength: 55 },
              description: { type: 'string', minLength: 1, maxLength: 45 },
              servings: { type: 'integer', minimum: 1, maximum: 50 },
              ingredients: {
                type: 'array',
                minItems: 4,
                maxItems: 5,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 40 },
                    quantity: { type: 'string', minLength: 1, maxLength: 8 },
                    unit: { type: 'string', minLength: 1, maxLength: 12 },
                  },
                  required: ['name', 'quantity', 'unit'],
                },
              },
              steps: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: { type: 'string', minLength: 1, maxLength: 80 },
              },
            },
            required: ['date', 'mealType', 'title', 'description', 'servings', 'ingredients', 'steps'],
          },
        },
      },
      required: ['items'],
    },
  },
};

/**
 * La settimana resta una singola chiamata applicativa e ogni pasto conserva una
 * ricetta completa. Quattro-cinque ingredienti e quattro passaggi bilanciano
 * completezza e dimensione del JSON strutturato dei 21 pasti.
 */
export const MEAL_PLAN_MAX_COMPLETION_TOKENS = 5000;
export const MEAL_PLAN_MODEL = "gpt-5-mini";

/**
 * Per il glutine non ci affidiamo solo alle istruzioni in linguaggio naturale:
 * il nome di ogni ingrediente viene vincolato dallo schema strutturato a una
 * lista naturale e già compatibile. Titoli e passaggi vengono comunque
 * validati dal controllo indipendente prima della risposta al client.
 */
function mealPlanResponseFormat(
  preferences?: MealPlanGenerationContext["preferences"],
  options?: {
    dates: string[];
    mealTypes: string[];
    itemCount: number;
    ingredientNames?: string[];
  },
) {
  if (!options) return MEAL_PLAN_RESPONSE_FORMAT;

  const ingredientNames = options.ingredientNames || (
    usesMealPlanIngredientAllowlist(preferences)
      ? compatibleMealIngredients(preferences, options.mealTypes.includes("breakfast") && options.mealTypes.length === 1 ? "breakfast" : "main")
      : undefined
  );
  const schema = MEAL_PLAN_RESPONSE_FORMAT.json_schema.schema;
  const itemSchema = schema.properties.items.items;
  const ingredientSchema = itemSchema.properties.ingredients.items;
  const itemCount = options?.itemCount || 3;
  const allowedDates = options?.dates || [];
  const allowedMealTypes = options?.mealTypes || ["breakfast", "lunch", "dinner"];
  // Il gateway Replit gestisce correttamente le proprietà obbligatorie, ma in
  // produzione ha lasciato passare `items: []` nonostante minItems=21. Per una
  // settimana usiamo quindi una chiave obbligatoria per ogni pasto e
  // ricomponiamo l'array solo dopo la risposta: il provider non può più
  // soddisfare lo schema con un piano vuoto.
  const slotKeys = Array.from(
    { length: itemCount },
    (_, index) => `meal_${String(index + 1).padStart(2, "0")}`,
  );
  const configuredItemSchema = {
    ...itemSchema,
    properties: {
      ...itemSchema.properties,
      date: { type: "string", enum: allowedDates },
      mealType: { type: "string", enum: allowedMealTypes },
      ingredients: {
        ...itemSchema.properties.ingredients,
        items: {
          ...ingredientSchema,
          properties: {
            ...ingredientSchema.properties,
            // La stessa lista chiusa ripetuta su 21 slot supera il limite
            // provider di 1.000 valori enum nello schema strutturato. Il
            // prompt mantiene la lista completa e validateMealPlanConstraints
            // la verifica in modo fail-closed prima di ogni risposta/salvataggio.
            name: ingredientSchema.properties.name,
          },
        },
      },
    },
  };

  return {
    type: "json_schema" as const,
    json_schema: {
      ...MEAL_PLAN_RESPONSE_FORMAT.json_schema,
      name: ingredientNames
        ? "allergen_safe_meal_plan_response"
        : "weekly_meal_plan_response",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          slotKeys.map((slotKey) => [slotKey, configuredItemSchema]),
        ),
        required: slotKeys,
      },
    },
  };
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
  pantryIngredients?: string[];
  provider?: AiProvider;
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

    const response = await getOpenAiClient(context.provider).chat.completions.create({
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

  assertAiConfigured(context.provider);
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
  provider?: AiProvider;
}): Promise<{ recipes: RecipeSuggestion[] }> {
  const randomSeed = Math.floor(Math.random() * 100000);
  const excludeList = (context.excludeTitles || []).slice(-30);
  const excludeLine = excludeList.length > 0
    ? ` Evita di riproporre queste ricette già mostrate: ${excludeList.join(', ')}.`
    : '';
  assertAiConfigured(context.provider);
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
      const response = await getOpenAiClient(context.provider).chat.completions.create({
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
    /** Sempre impostato dal server in base ai membri della famiglia. */
    servings?: number;
    ingredients?: MealPlanIngredient[];
    steps?: string[];
  }>;
}

const mealPlanIngredientSchema = z.object({
  name: z.coerce.string().trim().min(1),
  quantity: z.coerce.string().trim().min(1).optional(),
  unit: z.coerce.string().trim().min(1).optional(),
}).catchall(z.unknown());

const mealItemSchema = z.object({
  date: z.coerce.string(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  title: z.coerce.string().trim().min(1),
  description: z.coerce.string().trim().min(1).optional(),
  servings: z.coerce.number().int().positive().optional(),
  ingredients: z.array(mealPlanIngredientSchema).optional().catch([]),
  steps: z.array(z.coerce.string().trim().min(1)).optional().catch([]),
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

export interface MealPlanConstraintAttemptReport {
  /** Tentativo completo rifiutato dal validatore applicativo. */
  attempt: number;
  /** Solo codici di regola: non contiene titoli, ingredienti o preferenze. */
  violationCodes: string[];
}
export interface MealPlanAttemptTelemetry {
  generationAttempt: number;
  durationMs: number;
  providerDurationMs: number;
  responseChars: number;
  finishReasons: string[];
  itemsCount: number;
  failedChunks: number;
}
interface MealPlanGenerationContext {
  familySize: number;
  /** Scelto dalla rotta per l'utente; i job senza utente restano Replit. */
  provider?: AiProvider;

  weekStartDate: string;

  preferences?: import("./meal-plan-constraints").MealPlanConstraintPreferences;

  planVariant?: number;

  onProgress?: (items: MealPlanSuggestion['items']) => void;
  /**
   * Telemetria server-side del rifiuto di un tentativo. Non è esposta al
   * client e riceve esclusivamente codici di regola già normalizzati.
   */

  onStatus?: (message: string) => void;

  onConstraintViolation?: (report: MealPlanConstraintAttemptReport) => void;
  /** Metadati tecnici allow-listed per la diagnostica owner-only. */
  onAttemptTelemetry?: (report: MealPlanAttemptTelemetry) => void;
  /**
   * Limite ulteriore opzionale per un chiamante interno. Non può mai innalzare
   * il tetto applicativo standard di tentativi.
   */

  maxConstraintAttempts?: number;
  /**
   * Budget rigido opzionale delle invocazioni al modello per l'intera
   * generazione, inclusi ritentativi e ripassate anti-doppioni.
   */

  maxModelCalls?: number;
  /** Interrompe la chiamata al provider se il client HTTP si disconnette. */
  signal?: AbortSignal;
  /**
   * Per sentinelle sintetiche con contratto di telemetria minimale: sopprime
   * tutti i log interni della generazione. Il chiamante registra poi un unico
   * esito allow-listed (tentativi e soli codici di violazione).
   */

  suppressInternalLogs?: boolean;
}

function normalizeMealPlanGenerationPreferences(
  preferences: MealPlanGenerationContext["preferences"],
): MealPlanGenerationContext["preferences"] {
  if (!preferences) return preferences;
  const requestedProfile = preferences.dietProfile ?? preferences.diet;
  if (requestedProfile === undefined || requestedProfile === null || requestedProfile === "") {
    return preferences;
  }
  const dietProfile = normalizeMealPlanDietProfile(requestedProfile);
  if (!dietProfile) {
    throw new AiError(
      "AI_CONSTRAINT_VIOLATION",
      "Profilo dieta non riconosciuto: seleziona uno dei cinque profili disponibili",
    );
  }
  return { ...preferences, dietProfile, diet: undefined };
}

interface MealPlanModelCallBudget {
  maxCalls: number;
  usedCalls: number;
}

function remainingMealPlanModelCalls(budget: MealPlanModelCallBudget): number {
  return Math.max(0, budget.maxCalls - budget.usedCalls);
}

function canAffordMealPlanModelCalls(
  budget: MealPlanModelCallBudget,
  requiredCalls: number,
): boolean {
  return Number.isInteger(requiredCalls)
    && requiredCalls > 0
    && remainingMealPlanModelCalls(budget) >= requiredCalls;
}

function modelCallBudgetExhaustedError(budget: MealPlanModelCallBudget): AiError {
  return new AiError(
    "AI_MODEL_CALL_BUDGET_EXHAUSTED",
    `Budget interno chiamate piano pasti esaurito (${budget.maxCalls})`,
  );
}

function reserveMealPlanModelCall(budget?: MealPlanModelCallBudget): void {
  if (!budget) return;
  if (!canAffordMealPlanModelCalls(budget, 1)) {
    throw modelCallBudgetExhaustedError(budget);
  }
  // L'incremento avviene prima del primo await: anche le chiamate avviate
  // in parallelo non possono oltrepassare il tetto condiviso.
  budget.usedCalls++;
}

function mealPlanAttemptModelCallCost(context: MealPlanGenerationContext): number {
  // Una generazione applicativa corrisponde sempre a una richiesta JSON per
  // l'intera settimana. Il budget resta a 28 per compatibilità e difesa in
  // profondità, ma il percorso utente ne può avviare al massimo due.
  void context;
  return 1;
}
interface MealPlanGenerationAttemptContext extends MealPlanGenerationContext {
  constraintCorrection?: string;
  qualityCorrection?: string;
  /** JSON del tentativo precedente, disponibile solo per l'unico repair. */
  previousPlanJson?: string;
  generationAttempt: number;
  modelCallBudget?: MealPlanModelCallBudget;
}

class MealPlanConstraintRetryError extends Error {
  constructor(
    readonly violations: MealPlanConstraintViolation[],
    readonly items: MealPlanSuggestion["items"],
  ) {
    super("Il tentativo di generazione non rispetta i vincoli alimentari");
    this.name = "MealPlanConstraintRetryError";
  }
}

/**
 * Errore recuperabile della risposta completa. Il JSON precedente viene
 * consegnato una sola volta al repair, senza mai arrivare al client.
 */
class MealPlanRepairError extends Error {
  constructor(
    readonly items: MealPlanSuggestion["items"],
    readonly correction: string,
  ) {
    super("Il piano completo richiede una correzione mirata");
    this.name = "MealPlanRepairError";
  }
}

function buildMealPlanFormatCorrection(nextAttempt: number): string {
  return `
- CORREZIONE FORMATO OBBLIGATORIA (tentativo ${nextAttempt}): la risposta precedente non era JSON parsabile oppure non conteneva tutte le chiavi slot richieste.
- Restituisci esclusivamente l'oggetto JSON con TUTTE e SOLO le chiavi slot richieste dal contratto, una ricetta completa per ogni chiave.
- Non aggiungere Markdown, testo introduttivo, commenti, un array "items" o altre chiavi.`;
}

interface RepeatedMealSlot {
  date: string;
  mealType: MealPlanSuggestion["items"][number]["mealType"];
  title: string;
  semanticSignature?: string;
}

function normalizeMealPlanConcept(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MEAL_CONCEPT_STOP_WORDS = new Set([
  "al", "alla", "alle", "con", "col", "della", "delle", "del", "dei", "di",
  "e", "il", "la", "le", "lo", "un", "una", "per", "in", "da", "fresco",
  "fresca", "semplice", "leggera", "italiana", "mediterranea",
  "colazione", "pranzo", "cena", "pasto", "breakfast", "lunch", "dinner",
  "diversa", "titolo", "ignorato", "incompleto",
]);

function mealConceptTokens(value: string): Set<string> {
  return new Set(
    normalizeMealPlanConcept(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !MEAL_CONCEPT_STOP_WORDS.has(token)),
  );
}

function mealConceptsAreTooSimilar(left: string, right: string): boolean {
  const normalizedLeft = normalizeMealPlanConcept(left);
  const normalizedRight = normalizeMealPlanConcept(right);
  const leftTokens = mealConceptTokens(left);
  const rightTokens = mealConceptTokens(right);
  // Titoli tecnici come "Colazione 0" non sono ricette e non devono
  // influire sul controllo di varietà.
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  // Il confronto lessicale ampio faceva fallire piani validi: colazioni diverse
  // condividono naturalmente parole come "frutta" e "yogurt". I temi
  // giornalieri impongono varietà concreta; qui blocchiamo esclusivamente lo
  // stesso piatto dichiarato due volte.
  return normalizedLeft === normalizedRight;
}

function hasDeclaredLunchSemanticCore(item: MealPlanSuggestion["items"][number]): boolean {
  if (item.mealType !== "lunch") return false;
  const title = normalizeMealPlanConcept(item.title);
  const hasMacroCarbohydrate = /\b(?:pasta|spaghetti|penne|fusilli|maccheroni|riso|risotto|couscous|farro|orzo|quinoa|polenta|patate|ceci|lenticchie|fagioli|piselli)\b/.test(title);
  const hasProtein = /\b(?:salmone|merluzzo|tonno|pollo|tacchino|uova?|ceci|lenticchie|fagioli|piselli|ricotta|formaggio|parmigiano|mozzarella)\b/.test(title);
  return hasMacroCarbohydrate && hasProtein;
}

/**
 * Rileva lo stesso piatto dichiarato nel medesimo tipo di pasto, purché
 * appartenga a giorni diversi. I temi giornalieri garantiscono la varietà
 * delle combinazioni senza trasformare somiglianze lessicali in falsi errori.
 */
function findRepeatedMealConcepts(items: MealPlanSuggestion["items"]): string[] {
  return findRepeatedMealSlots(items).map((slot) => slot.title);
}

/**
 * Restituisce i pasti successivi che duplicano un titolo già usato nello
 * stesso tipo di pasto. Conservare il primo e sostituire quelli successivi
 * permette una correzione locale, molto meno costosa di un'altra settimana
 * intera generata in parallelo.
 */
function findRepeatedMealSlots(items: MealPlanSuggestion["items"]): RepeatedMealSlot[] {
  const seenTitles = new Map<string, Array<{ date: string; title: string }>>();
  const seenLunchSignatures = new Map<string, Set<string>>();
  const repeated: RepeatedMealSlot[] = [];

  for (const item of items) {
    const entries = seenTitles.get(item.mealType) || [];
    const repeatedTitle = entries.some((entry) =>
      entry.date !== item.date && mealConceptsAreTooSimilar(entry.title, item.title));
    const semanticSignature = item.mealType === "lunch"
      ? mealPlanLunchSemanticSignature(item)
      : undefined;
    const repeatedSemanticLunch = !!semanticSignature
      && hasDeclaredLunchSemanticCore(item)
      && (seenLunchSignatures.get(semanticSignature)?.size || 0) > 0;
    if (repeatedTitle || repeatedSemanticLunch) {
      repeated.push({
        date: item.date,
        mealType: item.mealType,
        title: item.title,
        semanticSignature: repeatedSemanticLunch ? semanticSignature : undefined,
      });
    }
    entries.push({ date: item.date, title: item.title });
    seenTitles.set(item.mealType, entries);
    if (semanticSignature) {
      const dates = seenLunchSignatures.get(semanticSignature) || new Set<string>();
      dates.add(item.date);
      seenLunchSignatures.set(semanticSignature, dates);
    }
  }
  return repeated.slice(0, 16);
}

/**
 * Le richieste giornaliere possono produrre lo stesso titolo generico
 * ("Pasta al pomodoro") per ricette che hanno proteine o verdure realmente
 * diverse. Invece di scartare un piano vario solo per l'etichetta, rendiamo
 * esplicito nel titolo un ingrediente già presente nella ricetta. Se non
 * esiste alcun ingrediente distintivo, il doppione resta tale e sarà
 * rigenerato: non si inventano né si nascondono differenze.
 */
function disambiguateMealTitles(
  items: MealPlanSuggestion["items"],
): MealPlanSuggestion["items"] {
  const usedTitles = new Map<string, Set<string>>();
  const ingredientSignaturesByTitle = new Map<string, Map<string, Set<string>>>();

  return items.map((item) => {
    const mealTypeTitles = usedTitles.get(item.mealType) || new Set<string>();
    const baseTitle = item.title.trim();
    const normalizedBase = normalizeMealPlanConcept(baseTitle);
    const ingredientSignature = (item.ingredients || [])
      .map((ingredient) => normalizeMealPlanConcept(ingredient.name))
      .filter(Boolean)
      .sort()
      .join("|");
    const signaturesForMealType = ingredientSignaturesByTitle.get(item.mealType) || new Map<string, Set<string>>();
    const existingSignatures = signaturesForMealType.get(normalizedBase) || new Set<string>();
    if (!mealTypeTitles.has(normalizedBase)) {
      mealTypeTitles.add(normalizedBase);
      existingSignatures.add(ingredientSignature);
      signaturesForMealType.set(normalizedBase, existingSignatures);
      usedTitles.set(item.mealType, mealTypeTitles);
      ingredientSignaturesByTitle.set(item.mealType, signaturesForMealType);
      return item;
    }
    // Stesso piatto con gli stessi ingredienti: non alterare il titolo per
    // mascherare un vero doppione.
    if (existingSignatures.has(ingredientSignature)) {
      return item;
    }

    const normalizedTitleWords = mealConceptTokens(baseTitle);
    const ingredientNames = (item.ingredients || [])
      .map((ingredient) => ingredient.name.trim())
      .filter(Boolean)
      .filter((name) => {
        const tokens = mealConceptTokens(name);
        return tokens.size > 0 && Array.from(tokens).some((token) => !normalizedTitleWords.has(token));
      });

    for (let count = 1; count <= ingredientNames.length; count++) {
      const candidate = `${baseTitle} con ${ingredientNames.slice(0, count).join(" e ")}`;
      const normalizedCandidate = normalizeMealPlanConcept(candidate);
      if (!mealTypeTitles.has(normalizedCandidate)) {
        mealTypeTitles.add(normalizedCandidate);
        existingSignatures.add(ingredientSignature);
        signaturesForMealType.set(normalizedBase, existingSignatures);
        usedTitles.set(item.mealType, mealTypeTitles);
        ingredientSignaturesByTitle.set(item.mealType, signaturesForMealType);
        return { ...item, title: candidate };
      }
    }

    existingSignatures.add(ingredientSignature);
    signaturesForMealType.set(normalizedBase, existingSignatures);
    usedTitles.set(item.mealType, mealTypeTitles);
    ingredientSignaturesByTitle.set(item.mealType, signaturesForMealType);
    return item;
  });
}

// Un piano con vincoli sanitari può richiedere UNA sola rigenerazione completa
// dopo una risposta semanticamente incompatibile. Il primo output non viene
// mai mostrato, quindi l'utente riceve solo il piano verificato e non deve
// premere nuovamente il pulsante. Oltre questo limite l'attesa e il consumo
// quota diventano sproporzionati.
const MAX_CONSTRAINT_GENERATION_ATTEMPTS = 2;
const MAX_MALFORMED_RESPONSE_RETRIES = 2;
// La varietà è best effort: le riparazioni locali non possono avviare una
// seconda settimana completa né sottrarre chiamate alla sicurezza.
const MAX_LOCAL_VARIETY_REPAIRS = 3;
/**
 * Tetto cumulativo per una generazione utente: include blocchi giornalieri,
 * retry obbligatori di formato/vincolo e riparazioni locali. 28 è il minimo
 * sostenibile: una settimana usa una richiesta giornaliera per sette giorni e
 * lascia spazio a rigenerazioni complete quando formato o sicurezza falliscono.
 * La varietà non può consumare una rigenerazione completa aggiuntiva.
 */
export const MAX_MEAL_PLAN_MODEL_CALLS = 28;
const SAFE_MAIN_INGREDIENTS = [
  "pasta", "pane", "couscous", "farro", "orzo", "avena", "cereali",
  "riso", "riso basmati", "riso integrale", "quinoa", "polenta di mais",
  "patate", "patate dolci", "ceci", "lenticchie", "fagioli", "piselli", "tofu", "tempeh",
  // Carni rosse già riconosciute dalle regole del Piano Pasti. Sono necessarie
  // anche alla lista chiusa dei profili mediterranei senza glutine/lattosio,
  // perché il loro target proteico settimanale possa restare verificabile.
  "uova", "pollo", "tacchino", "manzo", "vitello", "maiale", "agnello",
  "salmone", "merluzzo", "tonno",
  "olio extravergine di oliva",
  "pomodori", "zucchine", "melanzane", "peperoni", "carote", "spinaci",
  "bietole", "broccoli", "cavolfiore", "zucca", "cipolle", "aglio",
  "insalata", "rucola", "cetrioli", "fagiolini", "asparagi", "funghi",
  "limone", "olive", "basilico", "prezzemolo", "rosmarino", "origano",
  "sale", "pepe", "aceto",
];

const SAFE_GLUTEN_FREE_MAIN_INGREDIENTS = [
  "pasta senza glutine", "pasta di mais senza glutine", "pasta di riso senza glutine",
  "pane senza glutine", "fette biscottate senza glutine", "biscotti senza glutine",
  "couscous di mais senza glutine", "gnocchi senza glutine", "gallette di riso senza glutine",
];

const SAFE_NATURALLY_GLUTEN_FREE_MAIN_INGREDIENTS = SAFE_MAIN_INGREDIENTS.filter(
  (ingredient) => !/\b(?:pasta|pane|couscous|farro|orzo|avena|cereali)\b/.test(ingredient),
);

// Questi alimenti sono compatibili SOLTANTO con l'intolleranza al lattosio
// quando riportano la dicitura esplicita. Non entrano mai nel pool in caso di
// allergia alle proteine del latte.
const SAFE_LACTOSE_FREE_DAIRY_INGREDIENTS = [
  "latte senza lattosio", "yogurt senza lattosio", "ricotta senza lattosio",
  "mozzarella senza lattosio", "formaggio senza lattosio",
];

const SAFE_BREAKFAST_INGREDIENTS = [
  "mela", "banana", "pera", "arancia", "mandarino", "pesca", "albicocca",
  "fragole", "mirtilli", "lamponi", "uva", "kiwi",
  "yogurt bianco", "latte", "caffè", "cacao amaro", "miele", "marmellata",
  "pane", "fette biscottate",
  "pane senza glutine", "fette biscottate senza glutine", "biscotti senza glutine", "biscotti vegani",
  "gallette di riso", "gallette di riso senza glutine",
  "bevanda di riso", "bevanda di cocco", "yogurt vegetale di cocco",
];

const BREAKFAST_COMPATIBLE_MAIN_TERMS = new Set([
  "avena", "cereali", "limone",
  "olio extravergine di oliva", "basilico", "prezzemolo", "rosmarino", "origano",
  "sale", "pepe", "aceto",
]);

const SAVORY_BREAKFAST_TERMS = SAFE_MAIN_INGREDIENTS
  .filter((ingredient) =>
    !SAFE_BREAKFAST_INGREDIENTS.includes(ingredient) &&
    !BREAKFAST_COMPATIBLE_MAIN_TERMS.has(ingredient))
  .sort((a, b) => b.length - a.length);

function savoryBreakfastTerm(value: string): string | undefined {
  const normalizedValue = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:gallette|bevanda) di riso\b/g, "");
  return SAVORY_BREAKFAST_TERMS.find((ingredient) => {
    const normalizedIngredient = ingredient
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${normalizedIngredient}(?:$|[^a-z0-9])`).test(normalizedValue);
  });
}

export function compatibleMealIngredients(
  preferences?: MealPlanGenerationContext["preferences"],
  mealType: "breakfast" | "main" = "main",
): string[] {
  const isGlutenFree = mealPlanHasExclusion(preferences, "gluten");
  const avoidsLactose = mealPlanHasExclusion(preferences, "lactose");
  const vegetarian = mealPlanHasDietaryPattern(preferences, "vegetarian");
  const base = mealType === "breakfast"
    ? SAFE_BREAKFAST_INGREDIENTS
    : isGlutenFree
      ? [...SAFE_NATURALLY_GLUTEN_FREE_MAIN_INGREDIENTS, ...SAFE_GLUTEN_FREE_MAIN_INGREDIENTS]
      : SAFE_MAIN_INGREDIENTS;

  return [...base, ...(avoidsLactose ? SAFE_LACTOSE_FREE_DAIRY_INGREDIENTS : [])]
    .filter((ingredient) => {
      const normalizedIngredient = ingredient
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      // La dichiarazione "senza glutine" va gestita prima di qualsiasi filtro
      // lessicale: pasta/pane/biscotti esplicitamente compatibili devono
      // restare disponibili quando il vincolo canonico è glutine.
      if (isGlutenFree && /\b(?:pane|fette biscottate|biscotti|cornetto|pancake|avena|granola)\b/.test(normalizedIngredient) && !normalizedIngredient.includes("senza glutine")) return false;
       if (avoidsLactose && /\b(?:latte|yogurt|biscotti)\b/.test(normalizedIngredient) && !/\b(?:vegetale|cocco|riso|senza lattosio|delattosat)\b/.test(normalizedIngredient)) return false;
       if (avoidsLactose && !isGlutenFree && /\b(?:senza glutine|gluten free)\b/.test(normalizedIngredient)) return false;
      if (vegetarian && /\b(?:pollo|tacchino)\b/.test(normalizedIngredient)) return false;
      if (mealPlanConstraintsHaveViolation(ingredient, preferences)) return false;
      return true;
    });
}

function buildCompatibleBreakfastThemes(
  preferences?: MealPlanGenerationContext["preferences"],
): string[] {
  const allowed = new Set(compatibleMealIngredients(preferences, "breakfast"));
  const first = (...ingredients: string[]) => ingredients.find((ingredient) => allowed.has(ingredient));
  const fruits = [
    "mela", "banana", "pera", "arancia", "mandarino", "pesca", "albicocca",
    "fragole", "mirtilli", "lamponi", "uva", "kiwi",
  ].filter((ingredient) => allowed.has(ingredient));
  const fruit = (index: number) => fruits[index % Math.max(1, fruits.length)] || "frutta compatibile";
  const drink = first("latte", "bevanda di riso", "bevanda di cocco") || "bevanda compatibile";
  const spread = first("marmellata", "miele") || "una confettura compatibile";
  const bread = first("pane", "pane senza glutine") || "";
  const rusk = first("fette biscottate", "fette biscottate senza glutine") || "";
  const vegan = mealPlanHasDietaryPattern(preferences, "vegan");
  const biscuits = first(...(vegan ? ["biscotti vegani"] : ["biscotti senza glutine"])) || "";
  const yogurt = first("yogurt bianco", "yogurt vegetale di cocco") || "";
  const crispbread = first("gallette di riso", "gallette di riso senza glutine") || (rusk || bread || drink);

  return [
    yogurt ? `${yogurt} con ${fruit(0)} e ${spread}` : `${drink} con ${fruit(0)} e cacao amaro`,
    bread ? `${bread} con ${spread} e ${fruit(1)}` : `${crispbread} con ${spread} e ${fruit(1)}`,
    `frullato di ${fruit(2)} con ${drink} e cacao amaro`,
    biscuits ? `caffè o ${drink} con ${biscuits} e ${fruit(3)}` : `${drink} con ${fruit(3)} e una piccola porzione di frutta`,
    `${crispbread} con ${spread} e ${fruit(4)}`,
    `${rusk || bread || drink} con ${spread} e ${fruit(5)}`,
    `macedonia di ${fruit(6)} con ${drink} e ${spread}`,
  ];
}

/**
 * Per il lattosio le colazioni sono volutamente deterministiche: il modello
 * continuava a inserire riso da pranzo o latticini nel testo libero malgrado
 * schema e prompt. Queste sette ricette sono complete, differenti e prive di
 * latticini senza nominare sostituti ambigui; riducono inoltre sette chiamate
 * AI e i relativi errori di formato.
 */
function buildLactoseSafeBreakfasts(
  dates: string[],
  familySize: number,
  glutenFree = false,
): MealPlanSuggestion["items"] {
  const people = Math.max(1, Math.min(12, Math.floor(familySize) || 1));
  const fruitPieces = String(people);
  const breadSlices = String(people * 2);
  const drinkMl = String(people * 200);
  const jamG = String(people * 20);
  const bread = glutenFree ? "pane senza glutine" : "pane";
  const riceCakes = glutenFree ? "gallette di riso senza glutine" : "gallette di riso";
  const drink = glutenFree ? "latte" : "bevanda di riso";
  const entries = [
    {
      title: `${bread[0]!.toUpperCase()}${bread.slice(1)} tostato con marmellata e mela`,
      description: `Colazione dolce e semplice con ${bread} tostato, marmellata e mela fresca.`,
      ingredients: [
        { name: bread, quantity: breadSlices, unit: "fette" },
        { name: "marmellata", quantity: jamG, unit: "g" },
        { name: "mela", quantity: fruitPieces, unit: "pezzi" },
      ],
      steps: [
        "Lava le mele e tagliale a spicchi.",
        `Tosta il ${bread} fino a renderlo leggermente croccante.`,
        `Spalma la marmellata sul ${bread} e servi con gli spicchi di mela.`,
      ],
    },
    {
      title: `${riceCakes[0]!.toUpperCase()}${riceCakes.slice(1)} con banana e miele`,
      description: "Colazione leggera con gallette croccanti, banana e miele.",
      ingredients: [
        { name: riceCakes, quantity: String(people * 3), unit: "pezzi" },
        { name: "banana", quantity: fruitPieces, unit: "pezzi" },
        { name: "miele", quantity: String(people * 10), unit: "g" },
      ],
      steps: [
        "Sbuccia le banane e tagliale a rondelle.",
        "Disponi le gallette nei piatti.",
        "Aggiungi la banana e completa con un filo di miele.",
      ],
    },
    {
      title: `Frullato di pera e ${drink}`,
      description: `Frullato dolce alla pera con ${drink} e cacao amaro per una colazione fresca.`,
      ingredients: [
        { name: "pera", quantity: fruitPieces, unit: "pezzi" },
        { name: drink, quantity: drinkMl, unit: "ml" },
        { name: "cacao amaro", quantity: String(people * 5), unit: "g" },
      ],
      steps: [
        "Lava le pere, elimina il torsolo e tagliale a pezzi.",
        `Versa pere e ${drink} nel frullatore.`,
        "Frulla con il cacao amaro fino a ottenere una consistenza liscia.",
      ],
    },
    {
      title: "Macedonia di arancia e kiwi",
      description: "Macedonia fresca e naturalmente dolce con frutta di stagione.",
      ingredients: [
        { name: "arancia", quantity: fruitPieces, unit: "pezzi" },
        { name: "kiwi", quantity: fruitPieces, unit: "pezzi" },
        { name: "miele", quantity: String(people * 5), unit: "g" },
      ],
      steps: [
        "Sbuccia arance e kiwi con cura.",
        "Taglia la frutta a pezzi piccoli e raccoglila in una ciotola.",
        "Mescola la macedonia e completa con poco miele.",
      ],
    },
    {
      title: `${bread[0]!.toUpperCase()}${bread.slice(1)} con marmellata e pesca`,
      description: `${bread[0]!.toUpperCase()}${bread.slice(1)} morbido con marmellata e pesca fresca per iniziare la giornata.`,
      ingredients: [
        { name: bread, quantity: breadSlices, unit: "fette" },
        { name: "marmellata", quantity: jamG, unit: "g" },
        { name: "pesca", quantity: fruitPieces, unit: "pezzi" },
      ],
      steps: [
        "Lava le pesche, elimina il nocciolo e affettale.",
        `Disponi le fette di ${bread} nei piatti.`,
        `Spalma la marmellata sul ${bread} e aggiungi le fettine di pesca.`,
      ],
    },
    {
      title: `${riceCakes[0]!.toUpperCase()}${riceCakes.slice(1)} con mandarino e marmellata`,
      description: "Colazione croccante con gallette, mandarino e marmellata.",
      ingredients: [
        { name: riceCakes, quantity: String(people * 3), unit: "pezzi" },
        { name: "mandarino", quantity: String(people * 2), unit: "pezzi" },
        { name: "marmellata", quantity: jamG, unit: "g" },
      ],
      steps: [
        "Sbuccia i mandarini e dividi gli spicchi.",
        "Disponi le gallette nei piatti da portata.",
        "Spalma la marmellata sulle gallette e servi con i mandarini.",
      ],
    },
    {
      title: `${drink[0]!.toUpperCase()}${drink.slice(1)} con albicocche e cacao`,
      description: `Colazione fresca con ${drink}, albicocche e cacao amaro.`,
      ingredients: [
        { name: drink, quantity: drinkMl, unit: "ml" },
        { name: "albicocca", quantity: String(people * 2), unit: "pezzi" },
        { name: "cacao amaro", quantity: String(people * 5), unit: "g" },
      ],
      steps: [
        "Lava le albicocche, elimina il nocciolo e tagliale a spicchi.",
        `Versa ${drink} nei bicchieri.`,
        "Aggiungi il cacao amaro alla bevanda e servi con le albicocche.",
      ],
    },
  ];

  return dates.map((date, index) => ({
    date,
    mealType: "breakfast" as const,
    ...entries[index % entries.length]!,
  }));
}

function buildDinnerThemes(
  preferences?: MealPlanGenerationContext["preferences"],
): string[] {
  if (!hasMealPlanConstraints(preferences)) {
    return [
      "A CENA prepara pesce al forno o alla griglia, verdure e patate: non usare carne, uova o legumi.",
      "A CENA prepara pollo o tacchino con verdure saltate e riso o pane: non usare pesce.",
      "A CENA prepara una zuppa di legumi con verdure e pane: non usare carne, pesce o uova.",
      "A CENA prepara una frittata o uova con contorno di verdure e patate: non usare carne o pesce.",
      "A CENA prepara una carne bianca in umido con ortaggi e polenta o pane: non usare pesce o uova.",
      "A CENA prepara pesce in padella con verdure e riso: deve essere un pesce diverso dalla prima cena.",
      "A CENA prepara polpette vegetariane di legumi con insalata e patate: non usare carne, pesce o uova.",
    ];
  }

  const allowed = new Set(compatibleMealIngredients(preferences, "main"));
  const vegan = mealPlanHasDietaryPattern(preferences, "vegan");
  const canUseFish = ["salmone", "merluzzo", "tonno"].some((ingredient) => allowed.has(ingredient));
  const canUsePoultry = ["pollo", "tacchino"].some((ingredient) => allowed.has(ingredient));
  const canUseEggs = allowed.has("uova");
  const canUseLegumes = ["ceci", "lenticchie", "fagioli", "piselli"].some((ingredient) => allowed.has(ingredient));
  const protein = "una fonte proteica esplicitamente compatibile";

  if (vegan) {
    return [
      "A CENA prepara tofu al forno con verdure e patate.",
      "A CENA prepara ceci in umido con verdure e riso.",
      "A CENA prepara lenticchie in zuppa con verdure e una base compatibile.",
      "A CENA prepara tempeh in padella con verdure e patate.",
      "A CENA prepara fagioli con ortaggi e polenta di mais.",
      "A CENA prepara tofu alla griglia con verdure e riso.",
      "A CENA prepara tofu affumicato con broccoli e polenta di mais.",
    ];
  }

  return [
    canUseFish ? "A CENA usa pesce compatibile al forno con verdure e patate." : `A CENA usa ${protein} al forno con verdure e patate.`,
    canUsePoultry ? "A CENA usa pollo o tacchino compatibile in padella con verdure e riso." : `A CENA usa ${protein} in padella con verdure e riso.`,
    canUseLegumes ? "A CENA prepara legumi compatibili in zuppa con verdure e una fonte di carboidrati." : `A CENA prepara ${protein} in zuppa o vellutata con verdure.`,
    canUseEggs ? "A CENA prepara uova compatibili con verdure e patate." : `A CENA usa ${protein} con verdure e patate.`,
    `A CENA usa ${protein} in umido con ortaggi e polenta o riso.`,
    canUseFish ? "A CENA usa un pesce compatibile preparato in modo diverso dalla prima cena, con verdure e riso." : `A CENA usa ${protein} alla griglia con verdure e riso.`,
    canUseEggs ? "A CENA prepara uova al forno con spinaci e patate." : `A CENA usa ${protein} con spinaci e patate.`,
  ];
}

function mealPlanConstraintsHaveViolation(
  ingredient: string,
  preferences?: MealPlanGenerationContext["preferences"],
): boolean {
  if (!preferences) return false;
  return validateMealPlanConstraints(
    [{ title: ingredient, ingredients: [{ name: ingredient }] }],
    preferences,
  ).length > 0;
}

function usesMealPlanIngredientAllowlist(
  preferences?: MealPlanGenerationContext["preferences"],
): boolean {
  return hasMealPlanConstraints(preferences);
}

/**
 * Gli ingredienti dei piani con vincoli sanitari usano un elenco chiuso.
 * Titolo, descrizione e passaggi restano invece quelli completi prodotti
 * dall'AI: vengono controllati dal validatore indipendente prima della
 * consegna, così una ricetta incompatibile viene rigenerata e non appiattita
 * in istruzioni generiche.
 */
function buildConstraintCorrection(
  violations: MealPlanConstraintViolation[],
  nextAttempt: number,
): string {
  const detected = Array.from(new Set(
    violations.map((violation) =>
      violation.matched
        ? `${violation.constraint}: ${violation.matched}`
        : violation.constraint),
  )).slice(0, 12);

  const glutenCorrection = violations.some((violation) => violation.code === "gluten")
    ? `
- VINCOLO GLUTINE: usa solo ingredienti naturalmente privi di glutine o dichiarati esplicitamente "senza glutine". Non scrivere pasta, pane, farina, cereali, biscotti, pizza, farro, orzo o prodotti da forno non dichiarati senza glutine in nessun campo.`
    : "";
  const lactoseCorrection = violations.some((violation) => violation.code === "lactose")
    ? `
- VINCOLO LATTOSIO: ricrea il piano senza latte, yogurt, burro, panna, ricotta, mozzarella, formaggio, parmigiano, pecorino o mascarpone ordinari. Se serve un latticino usa soltanto una versione esplicitamente “senza lattosio” o vegetale. Pasta di semola, pane e fette biscottate normali restano compatibili: non sostituirli con prodotti senza glutine e non scrivere “senza glutine” o “gluten free”.`
    : "";
  const hasLactoseViolation = violations.some((violation) => violation.code === "lactose");
  const genericTerms = Array.from(new Set(
    violations
      .filter((violation) => violation.code === "generic-meal-term")
      .map((violation) => violation.matched)
      .filter((term): term is string => Boolean(term)),
  )).slice(0, 12);
  const genericTermCorrection = genericTerms.length > 0
    ? `
- CATEGORIE GENERICHE VIETATE: elimina letteralmente ${genericTerms.map((term) => `“${term}”`).join(", ")} da titoli, descrizioni, ingredienti e passaggi.
- Nell'array ingredients scrivi sempre il nome di un singolo alimento concreto: per esempio “zucchine”, “carote” o “spinaci”, mai “verdure”, “verdure miste”, “ortaggi”, “cereali”, “legumi”, “proteine” o “carboidrati”.`
    : "";
  const exactCorrection = `
- Non scrivere gli alimenti o i termini rilevati come incompatibili in nessun campo del nuovo piano, nemmeno come esempio o descrizione.
- Sostituisci ogni componente incompatibile con un ingrediente di tipo diverso e compatibile con tutti i vincoli indicati.`;
  const correctionIngredientRule = hasLactoseViolation
    ? "- Conserva ogni slot già valido. Modifica soltanto i pasti che contengono un termine rilevato, usando ingredienti naturalmente compatibili e senza dichiarazioni o etichette inutili sul lattosio."
    : "- Conserva ogni slot già valido. Modifica soltanto i pasti necessari: non riutilizzare gli alimenti incompatibili e usa alternative esplicitamente compatibili.";

  return `
- CORREZIONE AUTOMATICA OBBLIGATORIA (tentativo ${nextAttempt}): il piano precedente è stato scartato perché incompatibile.
- Incompatibilità rilevate dal controllo: ${detected.join("; ")}.
${correctionIngredientRule}${genericTermCorrection}${exactCorrection}
- Prima di rispondere esegui un secondo controllo completo contro dieta e allergie.${glutenCorrection}${lactoseCorrection}`;
}

function buildMealPlanQualityCorrection(error: AiError, nextAttempt: number): string {
  const breakfastCorrection = error.message.includes("colazione")
    ? `
- Per ogni breakfast usa esclusivamente una colazione dolce: non nominare né usare alimenti salati o da pranzo/cena nel titolo, descrizione, ingredienti o passaggi.`
    : "";
  const wholegrainCorrection = error.message.includes("integrali")
    ? `
- Non usare mai le parole "integrale", "integrali" o "integral" e non proporre pasta, riso, pane o cereali integrali: non sono stati richiesti. Usa esclusivamente equivalenti classici compatibili.`
    : "";
  const completenessCorrection = error.message.includes("incompleto")
    ? `
 - Per ogni ricetta compila tutti i campi: titolo, descrizione, almeno un ingrediente con nome/quantità/unità e tre passaggi non vuoti.`
    : "";
  const cookingDetailCorrection = error.message.includes("tempo o temperatura")
    ? `
- Per ogni pranzo e cena, indica in almeno un passaggio un tempo di cottura in minuti oppure una temperatura in °C. Evita istruzioni vaghe come “cuoci” senza una durata o temperatura.`
    : "";
  return `
- CORREZIONE DI QUALITÀ OBBLIGATORIA (tentativo ${nextAttempt}): il risultato precedente non era consegnabile.
- Restituisci esclusivamente tutti i pasti richiesti, completi e coerenti con il loro tipo.${breakfastCorrection}${wholegrainCorrection}${completenessCorrection}${cookingDetailCorrection}`;
}

function appendMealPlanCorrection(existing: string | undefined, next: string): string {
  return existing ? `${existing}\n${next}` : next;
}

async function generateWeeklyMealPlanAttempt(
  context: MealPlanGenerationAttemptContext,
): Promise<MealPlanSuggestion> {
  const attemptStartedAt = Date.now();
  let firstProviderStartedAt: number | null = null;
  let providerDurationMs = 0;
  let parsingDurationMs = 0;
  let responseChars = 0;
  const glutenFreeRequired = mealPlanRequiresGlutenFree(context.preferences);
  const lactoseFreeRequired = mealPlanHasExclusion(context.preferences, "lactose");
  const servings = Math.max(1, Math.floor(context.familySize) || 1);
  // I profili esclusivi hanno un contratto chiuso: 7 colazioni locali sicure
  // + 14 slot AI di pranzo/cena. Anche una preferenza legacy da 2 o 4 pasti
  // non può trasformare questo percorso in un piano parziale o far generare
  // snack non coperti dalla composizione verificata.
  // Il contratto pubblico è sempre una settimana completa da 21 pasti:
  // un eventuale valore legacy mealsPerDay non può ridurre né ampliare
  // il piano, i costi AI o il formato della risposta.
  const mealTypes = ['breakfast', 'lunch', 'dinner'];

  const variant = context.planVariant || 1;
  const variantHint = variant === 1
    ? 'Crea un piano equilibrato e classico con piatti tradizionali italiani.'
    : 'Questo è il PIANO B, l\'alternativa al piano classico: proponi piatti DIVERSI nella sostanza (ricette regionali diverse, tecniche di cottura diverse, ingredienti principali diversi), non semplici variazioni di nome o di condimento dei piatti più comuni.';

  const rawNotes = typeof context.preferences?.notes === 'string' ? context.preferences.notes.trim().slice(0, 600) : '';
  // "Dieta mediterranea" senza guida diventa spesso "tanti legumi, poca pasta,
  // poche verdure": ancoriamo la distribuzione settimanale reale della dieta.
  const dietLower = (context.preferences?.dietProfile || '').toLowerCase();
  const requiresMediterraneanRedMeat = mealPlanRequiresMediterraneanRedMeat(context.preferences);
  const mediterraneanDiet = requiresMediterraneanRedMeat;
  const constrainedPlan = hasMealPlanConstraints(context.preferences);
  const lactoseAllowsGluten = !glutenFreeRequired &&
    mealPlanHasExclusion(context.preferences, "lactose");
  const redMeatWeeklyRule = requiresMediterraneanRedMeat
    ? " Includi almeno un pasto principale con carne rossa nella settimana, preferibilmente uno."
    : "";
  const mediterraneanRule = mediterraneanDiet
    ? `\n- DIETA MEDITERRANEA OBBLIGATORIA: ${glutenFreeRequired ? "per il profilo senza glutine usa basi naturalmente prive di glutine come riso, quinoa, patate, polenta di mais e legumi; non usare basi generiche a rischio." : "ogni settimana deve includere almeno 2 pranzi con pasta"}, pesce 2-3 volte, carne bianca 1-2 volte, uova 1-2 volte e almeno un pranzo o cena con manzo, vitello o agnello. Ceci, lenticchie, fagioli e piselli in massimo 3 pranzi/cene totali.
- Ogni ingrediente deve essere concreto. Nell'array ingredients usa il nome di un singolo alimento, per esempio “zucchine”, “carote” o “spinaci”: non scrivere mai “Proteina”, “Carboidrato”, “Fonte proteica”, “Alimento proteico”, “verdure”, “verdure miste”, “ortaggi”, “cereali” o “legumi”. Varia davvero pranzi e cene italiani, non solo i contorni.${redMeatWeeklyRule}`
    : '';
  const lunchVarietyExplanation = glutenFreeRequired
    ? "la famiglia (riso, quinoa, legumi, zuppa, patate o polenta di mais), la base/preparazione (per esempio al pomodoro) e la firma completa con proteina sono tre livelli distinti."
    : "la famiglia (pasta, riso, legumi, zuppa, patate ecc.), la base/preparazione (per esempio al pomodoro) e la firma completa con proteina sono tre livelli distinti.";
  const weeklyVarietyRule = `
- VARIETÀ SETTIMANALE (best effort, mai in contrasto con i vincoli): sui pranzi e sulle cene cerca almeno 4 fonti di carboidrati diverse nella settimana e non usare la stessa più di 3 volte quando sono disponibili alternative compatibili.
- Alterna le proteine principali: evita la stessa proteina specifica più di 2 volte quando possibile; il pesce può comparire più volte, ma non ripetere sempre lo stesso tipo.
- PRANZI, VARIETÀ SEMANTICA: ${lunchVarietyExplanation} Contorni, olio, erbe e piccole verdure non trasformano un pranzo in un piatto nuovo.
${mediterraneanDiet && glutenFreeRequired ? `- Per una settimana mediterranea senza glutine usa la varietà delle basi naturalmente prive di glutine; non rendere obbligatori prodotti trasformati.` : ""}`;
  const mediterraneanDistributionRule = mediterraneanDiet
    ? glutenFreeRequired
      ? `
- DISTRIBUZIONE SENZA GLUTINE DEI PRANZI: segui nell'ordine esatto le famiglie del BLUEPRINT SETTIMANALE LOCALE. Alterna basi naturalmente prive di glutine concrete come riso, quinoa, patate, polenta di mais e legumi.
- Inserisci almeno una volta nella settimana un pranzo con pasta senza glutine (pasta senza glutine, di mais o di riso).
- Non usare mai pasta, couscous, pane, biscotti, farro, orzo o avena generici. Non trasformare una base sicura in una categoria generica: ogni ingrediente deve avere un nome concreto.
- Quando il pranzo è riso, quinoa, polenta, patate o legumi, la cena dello stesso giorno deve usare una combinazione diversa con verdure e una base naturalmente priva di glutine.`
      : `
- DISTRIBUZIONE MEDITERRANEA DEI PRANZI: segui nell'ordine esatto le famiglie del BLUEPRINT SETTIMANALE LOCALE. La rotazione alterna due pranzi di pasta non consecutivi, due piatti di legumi, due pranzi con patate e un solo pranzo con riso.
- Non sostituire patate o legumi con couscous, farro, orzo, quinoa o polenta: fuori dai due pranzi di pasta usa al massimo un pranzo a base di riso/cereali nella settimana.
- La pasta è sempre un primo asciutto: non scrivere né proporre mai “pasta in umido”, “pasta stufata” o “pasta brasata”.
- Quando il pranzo è pasta o riso/cereali, la cena dello stesso giorno deve essere un secondo con verdure e patate o pane, mai ancora riso, couscous, farro, orzo, quinoa o polenta.`
    : "";
  const glutenFreeWeeklyPastaRule = glutenFreeRequired && !mediterraneanDiet
    ? `
- OBBLIGO SETTIMANALE SENZA GLUTINE: inserisci almeno un pranzo con pasta senza glutine (pasta senza glutine, di mais o di riso). In tutti gli altri casi continua a usare soltanto basi compatibili.`
    : "";
  const lactoseLunchVarietyRule = lactoseFreeRequired
    ? `
- PRANZI, VARIETÀ DI STRUTTURA (dopo la sicurezza): non ripetere lo stesso schema “carboidrato + base + proteina” in due giorni consecutivi; usalo al massimo 2 volte nella settimana. Una pasta al pomodoro e tonno con contorni, olio o erbe diversi resta lo stesso schema.
- Con almeno 6 pranzi, usa quando compatibile almeno 4 famiglie diverse (per esempio pasta, risotto/riso, couscous, cereale in chicco, piatto di legumi, zuppa, patate/polenta, insalata di cereali o pane/piadina). Non forzare la pasta.`
    : "";
  const glutenFreeTitleRule = glutenFreeRequired
    ? `\n- Nei titoli non aggiungere meccanicamente “senza glutine” a piatti naturalmente privi di glutine. Mantieni la dicitura soltanto quando identifica davvero un prodotto sostitutivo, per esempio pasta o pane senza glutine.`
    : "";
  const prefText = context.preferences
    ? `${context.preferences.dietProfile ? ` Profilo dieta: ${context.preferences.dietProfile}.` : ''}${context.preferences.maxTimeMinutes ? ` Tempo max preparazione: ${context.preferences.maxTimeMinutes} min.` : ''}${rawNotes ? ` Preferenze della famiglia (dettate a voce, seguile con attenzione): ${rawNotes}.` : ''}`
    : '';
  const constraintRule = buildMealPlanConstraintPrompt(context.preferences);
  const constraintCorrection = context.constraintCorrection || "";
  const qualityCorrection = context.qualityCorrection || "";

  // Piatti tradizionali: il modello tende a "salutizzare" tutto proponendo
  // pasta/pane integrali ovunque. Niente varianti integrali salvo richiesta.
  const wantsWholegrain = dietLower.includes('integral') ||
    rawNotes.toLowerCase().includes('integral');
  const wholegrainRule = glutenFreeRequired || wantsWholegrain
    ? ''
    : `\n- Pasta, riso e pane: usa quelli CLASSICI (pasta di semola, riso bianco, pane comune). NON proporre varianti "integrali" a meno che l'utente non le chieda espressamente. Questo vale anche se sono presenti allergie, intolleranze o altri vincoli: tali vincoli non implicano mai prodotti integrali.`;
  // Il modello è poco affidabile nel dichiarare "senza glutine" su ogni campo
  // della ricetta (titolo, ingredienti e passaggi). Per una richiesta legata
  // al glutine privilegiamo quindi ingredienti naturalmente idonei: è più
  // sicuro e impedisce che un'etichetta parziale faccia scartare l'intero piano.
  const dates: string[] = [];
  const start = new Date(context.weekStartDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]!);
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

  // Dieta mediterranea: i temi supportano la piramide alimentare, mentre la
  // famiglia concreta del pranzo viene pianificata separatamente più sotto.
  // Così un tema non può riportare pasta quasi ogni giorno.
  const mediterraneanDayThemes = [
    'a pranzo pasta al pomodoro con tonno e zucchine; a cena pesce azzurro al forno con verdure e pane',
    'a pranzo pasta con zucchine e pollo; a cena riso con merluzzo e verdure',
    'a pranzo un piatto di legumi completo con verdure; a cena carne bianca (pollo o tacchino) con verdure e patate o farro',
    'a pranzo couscous con pesce e verdure; a cena uova con spinaci e patate',
    'a pranzo farro con tacchino e verdure; a cena pesce con verdure e pane',
    'a pranzo patate al forno con uova e verdure; a cena pollo con verdure e riso',
    'a pranzo quinoa con manzo e verdure; a cena minestra leggera con verdure e pane',
  ];
  // Piano B mediterraneo: stessa rotazione strutturale, con combinazioni e
  // tecniche diverse dal piano A.
  const mediterraneanDayThemesB = [
    'a pranzo pasta al pesto leggero con tonno e verdure; a cena polpo o calamari con patate e verdure',
    'a pranzo legumi in umido con verdure e una fonte di carboidrati; a cena minestra di lenticchie con verdure e pane',
    'a pranzo couscous con ortaggi e tacchino; a cena pesce spada alla griglia con verdure e patate',
    'a pranzo orzo con verdure e pesce; a cena uova in purgatorio con pane e verdure',
    'a pranzo patate al forno con pollo e verdure; a cena salmone con verdure e riso',
    'a pranzo quinoa con zucchine e uova; a cena ceci in umido con verdure e pane',
    'a pranzo pasta al ragù leggero di manzo e verdure; a cena alici al forno con verdure e patate',
  ];
  // Quando è richiesto il senza glutine, i temi normali diventano istruzioni
  // contraddittorie (pasta, pane, farro, orzo, biscotti). Non basta chiedere
  // al modello di ignorarli: sostituiamoli con alternative naturalmente prive
  // di glutine, così il primo tentativo è già praticabile per il validatore.
  const glutenFreeDayThemes = [
    'a pranzo pasta senza glutine con pollo e zucchine; a cena salmone con patate e fagiolini',
    'a pranzo quinoa con merluzzo e spinaci; a cena tacchino con patate e carote',
    'a pranzo ceci con riso e peperoni; a cena uova con patate e spinaci',
    'a pranzo polenta di mais con tonno e zucchine; a cena lenticchie con riso e carote',
    'a pranzo patate con manzo e bietole; a cena merluzzo con quinoa e broccoli',
    'a pranzo riso con uova e zucchine; a cena pollo con polenta di mais e peperoni',
    'a pranzo quinoa con tacchino e carote; a cena salmone con patate e fagiolini',
  ];
  const glutenFreeDayThemesB = [
    'a pranzo pasta senza glutine con tonno e pomodori; a cena polpo con patate e zucchine',
    'a pranzo lenticchie con quinoa e carote; a cena merluzzo con patate e spinaci',
    'a pranzo polenta di mais con tacchino e peperoni; a cena salmone con riso e fagiolini',
    'a pranzo ceci con patate e zucchine; a cena uova con quinoa e spinaci',
    'a pranzo riso con manzo e bietole; a cena pollo con patate e carote',
    'a pranzo quinoa con uova e pomodori; a cena tonno con polenta di mais e zucchine',
    'a pranzo patate con tacchino e broccoli; a cena salmone con riso e peperoni',
  ];
  const compatibleDayThemes = [
    'componi un pranzo e una cena esclusivamente con ingredienti compatibili e verdure di stagione',
    'varia gli ortaggi e scegli soltanto fonti proteiche compatibili con i vincoli',
    'usa una preparazione semplice con contorni di verdure e ingredienti compatibili',
    'proponi un piatto completo verificando ogni componente contro i vincoli',
    'scegli ingredienti freschi e compatibili, senza sostituti impliciti',
    'varia tecniche di cottura e verdure mantenendo tutti gli ingredienti compatibili',
    'proponi un piatto italiano semplice composto solo da ingredienti compatibili',
  ];
  const activeDinnerThemes = buildDinnerThemes(context.preferences);

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
  const glutenFreeBreakfastThemes = [
    'yogurt bianco con banana e miele',
    'frullato di banana, latte e cacao amaro',
    'pane senza glutine con marmellata e arancia',
    'caffellatte con biscotti senza glutine',
    'yogurt bianco con pera e cacao amaro',
    'gallette di riso senza glutine con miele e kiwi',
    'smoothie di frutta con latte',
  ];
  const compatibleBreakfastThemes = buildCompatibleBreakfastThemes(context.preferences);
  const activeBreakfastThemes = glutenFreeRequired
    ? glutenFreeBreakfastThemes
    : constrainedPlan
      ? compatibleBreakfastThemes
      : breakfastThemes;
  // Per i due profili esclusivi le colazioni sono costruite localmente con
  // combinazioni concrete già verificate. Il modello riceve solo pranzi e
  // cene: così non può introdurre una base ambigua (o classificare un dolce
  // con riso come colazione salata) e il contratto finale resta di 21 pasti.
  const hasDeterministicBreakfasts =
    glutenFreeRequired || lactoseFreeRequired;
  const deterministicBreakfasts: MealPlanSuggestion["items"] =
    (hasDeterministicBreakfasts
      ? buildLactoseSafeBreakfasts(dates, context.familySize, glutenFreeRequired)
      : []).map((item) => ({ ...item, servings }));
  const modelMealTypes = hasDeterministicBreakfasts
    ? mealTypes.filter((mealType) => mealType !== "breakfast")
    : mealTypes;

  type WeeklyMealRequest = {
    dates: string[];
    mealTypes: string[];
    slotKeys: string[];
    ingredientNames?: string[];
    label: string;
    themeHint?: string;
    breakfastHint?: string;
    lunchFamilyTarget?: string;
    lunchSemanticTarget?: { mainProtein?: string; preparation?: string };
  };
  const allergenSafePlan = usesMealPlanIngredientAllowlist(context.preferences);
  const standardPlan = !constrainedPlan;
  const compatibleMainIngredients = compatibleMealIngredients(context.preferences, "main");
  const glutenFreeNaturalMainIngredients = compatibleMainIngredients.filter((ingredient) =>
    !/\b(?:pasta|pane|couscous|fette biscottate|biscotti|farro|orzo|avena|cereali|gnocchi)\b/i.test(ingredient));
  const blueprintMainIngredients = glutenFreeRequired
    ? [...glutenFreeNaturalMainIngredients, "pasta senza glutine", "pasta di mais senza glutine", "pasta di riso senza glutine"]
    : compatibleMainIngredients;
  const lunchFamilyTargets = planMealPlanLunchFamilies(
    blueprintMainIngredients,
    dates.length,
    // Il Piano B usa la stessa distribuzione mediterranea ma parte dai legumi:
    // le due paste restano distanziate e i pranzi a base di cereali non si
    // concentrano all'inizio della settimana.
    variant === 2 ? 1 : 0,
    {
      minimumPastaLunches: mediterraneanDiet && !glutenFreeRequired ? 2 : 0,
      mediterraneanDistribution: mediterraneanDiet,
    },
  );
  const lunchSemanticTargets = planMealPlanLunchSemanticTargets(
    compatibleMainIngredients,
    dates.length,
    variant === 2 ? 1 : 0,
    { requireRedMeat: requiresMediterraneanRedMeat },
  );
  // Il blueprint è totalmente locale: prima della chiamata decidiamo la
  // rotazione di famiglie, proteine/preparazioni, colazioni e cene. Il modello
  // riceve poi una sola richiesta con i 21 pasti della settimana, non sette
  // richieste indipendenti che potrebbero contraddirsi tra loro.
  const safeIngredients = allergenSafePlan
    ? Array.from(new Set(blueprintMainIngredients))
    : undefined;
  const weeklyBlueprint = dates.map((date, dayIndex) => {
    const glutenFreeTheme = glutenFreeRequired
      ? (variant === 2 ? glutenFreeDayThemesB : glutenFreeDayThemes)[dayIndex]!
      : "";
    const [glutenFreeLunchTheme = "", glutenFreeDinnerTheme = ""] =
      glutenFreeTheme.split("; a cena ");
    const breakfast = modelMealTypes.includes("breakfast")
      ? `colazione: ${activeBreakfastThemes[dayIndex]}`
      : "";
    const lunch = modelMealTypes.includes("lunch")
      ? glutenFreeRequired
        ? `pranzo: ${glutenFreeLunchTheme.replace(/^a pranzo /, "")}`
        : `pranzo: famiglia ${lunchFamilyTargets[dayIndex] || "compatibile"}, proteina ${lunchSemanticTargets[dayIndex]?.mainProtein || "compatibile"}, preparazione ${lunchSemanticTargets[dayIndex]?.preparation || "diversa"}`
      : "";
    const dinner = modelMealTypes.includes("dinner")
      ? glutenFreeRequired
        ? `cena: ${glutenFreeDinnerTheme}`
        : `cena: ${activeDinnerThemes[dayIndex]}`
      : "";
    return `- ${date}: ${[breakfast, lunch, dinner].filter(Boolean).join("; ")}.`;
  }).join("\n");
  const weeklyRequests: WeeklyMealRequest[] = [{
    dates,
    mealTypes: modelMealTypes,
    slotKeys: Array.from(
      { length: dates.length * modelMealTypes.length },
      (_, index) => `meal_${String(index + 1).padStart(2, "0")}`,
    ),
    ingredientNames: safeIngredients,
    label: "full-week",
    themeHint: weeklyBlueprint,
  }];

  async function fetchChunk(
    request: WeeklyMealRequest,
    themeHint?: string,
    breakfastHint?: string,
    localCorrection = "",
    priorVarietyContext = "",
  ): Promise<MealPlanSuggestion['items']> {
    const chunkDates = request.dates;
    const requestMealTypes = request.mealTypes;
    const mealsForRequest = requestMealTypes.length;
    const requestGlutenRule = glutenFreeRequired
      ? `\n- PIANO SENZA GLUTINE: scegli OGNI ingrediente solamente da questa lista chiusa per questa richiesta: ${(request.ingredientNames || compatibleMealIngredients(context.preferences, "main")).join(", ")}. Non aggiungere ingredienti esterni.
 - Per pranzi e cene usa prima di tutto le basi naturalmente prive di glutine concrete indicate dal BLUEPRINT (riso, quinoa, patate, polenta di mais, ceci, lenticchie, fagioli o piselli), con l'unica eccezione della pasta senza glutine espressamente prevista. Non usare pasta, couscous, pane, biscotti, farro, orzo o avena generici in nessun campo.`
      : "";
    const lactosePastaRule = lactoseAllowsGluten && requestMealTypes.includes("lunch")
      ? "\n- Il vincolo lattosio/latte NON richiede di evitare il glutine: pasta di semola classica e gli altri cereali con glutine restano compatibili, purché non contengano latte o derivati incompatibili."
      : "";
    const lunchFamilyTargetRule = requestMealTypes.includes("lunch") && request.lunchFamilyTarget
      ? `\n- OBIETTIVO FAMIGLIA PRANZO DEL GIORNO: ${request.lunchFamilyTarget}. Il pranzo DEVE appartenere a questa famiglia, salvo conflitto con un vincolo di sicurezza. Non sostituirla con pasta o un'altra famiglia solo cambiando condimento, contorno, olio o erbe.`
      : "";
    const lunchSemanticTargetRule = requestMealTypes.includes("lunch")
      && (request.lunchSemanticTarget?.mainProtein || request.lunchSemanticTarget?.preparation)
      ? `\n- OBIETTIVO PROFILO PRANZO DEL GIORNO: proteina principale ${request.lunchSemanticTarget?.mainProtein === "red_meat" ? "red_meat (carne rossa: manzo, vitello, maiale o agnello compatibile)" : request.lunchSemanticTarget?.mainProtein || "compatibile"}; profilo/preparazione ${request.lunchSemanticTarget?.preparation || "diverso dai giorni già usati"}. Quando compatibile, seguilo senza ripetere una coppia proteina + profilo già presente nel contesto.`
      : "";
    const lactoseFreeOutputRule = lactoseFreeRequired
    ? `\n- PIANO SENZA LATTOSIO: evita latte, yogurt, burro, panna, ricotta, mozzarella, formaggio, parmigiano, pecorino e mascarpone ordinari. Se servono, usa solo prodotti esplicitamente “senza lattosio” o vegetali. Pasta di semola, pane e fette biscottate normali sono consentiti. Non aggiungere mai “senza glutine” o “gluten free” a titoli, ingredienti o passaggi: questo profilo non richiede vincoli sul glutine.`
      : "";
    const breakfastMealRule = constrainedPlan
      ? `- breakfast (colazione): SOLO una colazione leggera composta esclusivamente da ingredienti compatibili con TUTTI i vincoli.${glutenFreeRequired ? ' Se usi un prodotto a base di cereali o farina, deve essere dichiarato esplicitamente senza glutine in titolo, ingredienti e passaggi.' : ''} Non usare esempi standard né sostituti impliciti.`
      : `- breakfast (colazione): SOLO colazione italiana tipica, dolce e leggera. Es. cappuccino e cornetto, latte e biscotti, fette biscottate con marmellata, yogurt con cereali e frutta, pane con marmellata o miele, crostata, ciambellone, pancake, porridge, spremuta con plumcake. MAI piatti salati come pasta, carne, pesce, verdure cotte o bruschette salate.`;
    const lunchMealRule = constrainedPlan
      ? `- lunch (pranzo): pasto principale completo con ingredienti compatibili, una fonte proteica compatibile e verdure.${glutenFreeRequired ? ' Ogni componente a base di cereali o farina deve essere esplicitamente senza glutine.' : ''}`
      : `- lunch (pranzo): pasto principale completo (es. primo di pasta/riso o piatto unico con contorno).`;
    const dinnerMealRule = constrainedPlan
      ? `- dinner (cena): pasto più leggero del pranzo con ingredienti compatibili, una fonte proteica compatibile e verdure.${glutenFreeRequired ? ' Ogni componente a base di cereali o farina deve essere esplicitamente senza glutine.' : ''}`
      : `- dinner (cena): pasto più leggero del pranzo (es. secondo di carne/pesce/uova/legumi con verdure, zuppe, minestre).`;
    const completeLunchRule = constrainedPlan
      ? `- A pranzo includi soltanto componenti compatibili con tutti i vincoli, senza lasciare impliciti condimenti o ingredienti composti.`
      : `- A pranzo il primo deve includere una fonte proteica (es. pasta con legumi/pesce/ragù bianco/uova/formaggio come tonno, ceci, sgombro, ricotta) oppure va aggiunto un secondo leggero: MAI solo pasta al pomodoro senza proteine.`;
    const completeDinnerRule = constrainedPlan
      ? `- A cena includi soltanto componenti compatibili con tutti i vincoli, senza lasciare impliciti condimenti o ingredienti composti.`
      : `- A cena, accanto alla fonte proteica, includi SEMPRE una porzione di carboidrati (pane, patate, farro, orzo o riso): MAI solo proteine e verdure.`;
    const snackMealRule = constrainedPlan
      ? `- snack (spuntino): piccolo e leggero, composto esclusivamente da ingredienti compatibili con TUTTI i vincoli.`
      : `- snack (spuntino): piccolo e leggero (es. frutta, yogurt, frutta secca, una merenda).`;
    const itemContract = `- Ogni pasto ha: date (una YYYY-MM-DD tra quelle indicate), mealType (${requestMealTypes.join('|')}), title (massimo 8 parole), description (una frase utile di massimo 7 parole), servings (intero, sempre ${servings}), ingredients (4-5 voci: includi TUTTI gli ingredienti realmente necessari), steps (ESATTAMENTE 4 passaggi).`;
    const preparationContract = `- steps è la RICETTA completa, passo-passo: ESATTAMENTE 4 istruzioni concrete in italiano (ogni passaggio è una stringa, senza numerazione iniziale, massimo 80 caratteri). Specifica taglio/preparazione e, per pranzo o cena, un tempo in minuti o una temperatura in °C. Nei 4-5 ingredienti elenca anche condimenti e basi realmente usati, con quantità concrete; non aggiungere elementi opzionali o spiegazioni.`;
    const constrainedRecipeReferenceRule = constrainedPlan && !lactoseFreeRequired
      ? `- VINCOLI NELLA RICETTA: per ogni ingrediente soggetto a un vincolo usa, nel titolo, descrizione e in OGNI passaggio, il nome completo e compatibile scritto nell'array ingredients. Non abbreviare né sostituire con parole generiche un ingrediente sensibile (per esempio non scrivere "latte", "yogurt" o "formaggio" se nell'array è presente un sostituto vegetale o senza lattosio).`
      : "";
    const responseContract = `{"meal_01":{"date":"YYYY-MM-DD","mealType":"...","title":"...","description":"breve descrizione","servings":${servings},"ingredients":[{"name":"...","quantity":"...","unit":"..."}],"steps":["prepara","cuoci","assembla"]},"meal_02":{...},"...":"..."}`;
    const sysPrompt = `Sei un nutrizionista italiano. Genera i pasti SOLO per questi giorni: ${chunkDates.join(', ')}.
REGOLE:
- Questa richiesta riguarda SOLO questi tipi di pasto: ${requestMealTypes.join(', ')}. Per ogni giorno genera esattamente ${mealsForRequest} pasti: ${requestMealTypes.join(', ')}.
${itemContract}
- Il JSON top-level DEVE contenere TUTTE e SOLO queste ${request.slotKeys.length} chiavi obbligatorie: ${request.slotKeys.join(", ")}. Non usare un array "items" e non omettere nessuna chiave.
- Ogni ingrediente ha name, quantity e unit NON VUOTI. quantity deve essere concreta (es. "200", "1") e unit deve essere presente (es. "g", "ml", "pezzi"); per una quantità realmente non misurabile scrivi quantity "q.b." e unit "per condire", mai una stringa vuota.
- Le quantità degli ingredienti devono essere calibrate per ESATTAMENTE ${servings} persone. Non usare quantità generiche o porzioni individuali.
${preparationContract}
${constrainedRecipeReferenceRule}
- IMPORTANTE: ogni piatto DEVE essere adatto al suo tipo di pasto secondo le abitudini italiane:
  ${breakfastMealRule}
  ${lunchMealRule}
  ${dinnerMealRule}
   ${snackMealRule}
- EQUILIBRIO NUTRIZIONALE: ogni pranzo e ogni cena deve essere un pasto COMPLETO con tutti e tre: carboidrati + proteine + verdure.
  ${completeLunchRule}
  ${completeDinnerRule}
        - Verdure: includi verdure fresche o un contorno di verdure in OGNI pranzo e cena.${mediterraneanRule}${mediterraneanDistributionRule}${weeklyVarietyRule}${lactoseLunchVarietyRule}${lunchFamilyTargetRule}${lunchSemanticTargetRule}${wholegrainRule}${requestGlutenRule}${lactosePastaRule}${lactoseFreeOutputRule}${glutenFreeTitleRule}
- Includi tutti gli ingredienti necessari. Non ripetere lo stesso piatto per lo stesso giorno.${glutenFreeWeeklyPastaRule}
 - ${variantHint}${themeHint ? `\n- BLUEPRINT SETTIMANALE LOCALE: segui esattamente questi obiettivi già pianificati, senza scambiarli tra date:\n${themeHint}` : ''}${breakfastHint && requestMealTypes.includes('breakfast') ? `\n- Per la colazione indicata realizza questa combinazione concreta: ${breakfastHint}.` : ''}
  ${constraintRule}${priorVarietyContext}${constraintCorrection}${qualityCorrection}${localCorrection}${context.previousPlanJson ? `\n- JSON DEL PIANO PRECEDENTE DA CORREGGERE (non copiare gli errori; conserva ogni elemento già valido e modifica soltanto quelli necessari): ${context.previousPlanJson}` : ""}
- Rispondi SOLO con JSON: ${responseContract}`;
    const userMsg = `Famiglia di ${context.familySize} persone.${prefText}`;

    reserveMealPlanModelCall(context.modelCallBudget);
    modelCallsStarted++;
    const providerStartedAt = Date.now();
    firstProviderStartedAt ??= providerStartedAt;
    let response: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;
    try {
      response = await getOpenAiClient(context.provider).chat.completions.create(
        {
          model: MEAL_PLAN_MODEL,
          reasoning_effort: 'minimal',
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: userMsg },
          ],
          response_format: mealPlanResponseFormat(context.preferences, {
            dates: chunkDates,
            mealTypes: requestMealTypes,
            itemCount: chunkDates.length * mealsForRequest,
            ingredientNames: request.ingredientNames,
          }),
          // Il contratto compatto riduce il tempo di generazione mantenendo tre
          // passaggi utilizzabili per ogni ricetta. La risposta resta strutturata
          // e viene sempre validata integralmente prima della consegna.
          max_completion_tokens: MEAL_PLAN_MAX_COMPLETION_TOKENS,
        },
        // Una settimana è già la singola chiamata consentita dal contratto.
        // Un retry di trasporto dell'SDK raddoppierebbe il tempo percepito al
        // timeout (e la chiamata fisica al provider) senza poter consegnare
        // output parziale sicuro al client.
        {
          maxRetries: 0,
          timeout: MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
          ...(context.signal ? { signal: context.signal } : {}),
        },
      );
    } finally {
      providerDurationMs += Date.now() - providerStartedAt;
    }

    const choice = response.choices[0];
    const finishReason = choice?.finish_reason || "unknown";
    const content = choice?.message.content || "";
    finishReasons.push(finishReason);
    responseChars += content.length;
    // Il gateway non consegna JSON parziale quando structured output chiude per
    // limite. Senza alcun elemento un repair ripete la stessa settimana e non
    // può recuperare il risultato: fermiamo la spesa dopo una sola chiamata.
    if (finishReason === "length") {
      throw new AiError("AI_BAD_RESPONSE", "Piano pasti: output strutturato interrotto per limite di lunghezza");
    }
    const parsingStartedAt = Date.now();
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Un JSON invalido è un difetto recuperabile dell'output del Piano Pasti,
        // non un errore di trasporto/provider: il chiamante avvierà un solo repair.
        throw new MealPlanRepairError([], buildMealPlanFormatCorrection(context.generationAttempt + 1));
      }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new MealPlanRepairError([], buildMealPlanFormatCorrection(context.generationAttempt + 1));
      }
        const slotResponse = parsed as Record<string, unknown>;
        if (!request.slotKeys.every((slotKey) => Object.hasOwn(slotResponse, slotKey))) {
          throw new MealPlanRepairError([], buildMealPlanFormatCorrection(context.generationAttempt + 1));
        }
        return parseMealItems({
          items: request.slotKeys.map((slotKey) => slotResponse[slotKey]),
        }).map((item) => ({ ...item, servings }));
    } finally {
      parsingDurationMs += Date.now() - parsingStartedAt;
    }
  }

  assertAiConfigured(context.provider);
  const validDates = new Set(dates);

  const allItems: MealPlanSuggestion['items'] = [...deterministicBreakfasts];
  let failedChunks = 0;
  let firstReason: unknown = null;
  let modelCallsStarted = 0;
  const finishReasons: string[] = [];
  // I temi, le famiglie-obiettivo e le firme proteiche vengono pianificati
  // prima delle chiamate: tutti i sette giorni possono partire in parallelo.
  // La validazione fail-closed e le riparazioni locali restano a valle, quindi
  // nessun output incompatibile arriva al client.
  const results = await Promise.allSettled(
    weeklyRequests.map((request) => fetchChunk(
      request,
      request.themeHint,
      request.breakfastHint,
    )),
  );
  const budgetFailure = results.find((result) =>
    result.status === "rejected"
    && result.reason instanceof AiError
    && result.reason.code === "AI_MODEL_CALL_BUDGET_EXHAUSTED");
  if (budgetFailure?.status === "rejected") throw budgetFailure.reason;
  for (const result of results) {
    if (result.status === "fulfilled") allItems.push(...result.value);
  }
  for (const result of results) {
    if (result.status === "rejected") {
      failedChunks++;
      if (firstReason === null) firstReason = result.reason;
      if (!context.suppressInternalLogs) {
        console.error("Meal plan request failed:", String(result.reason));
      }
      continue;
    }
  }

  const filtered = allItems.filter((it) => validDates.has(it.date));
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (mealOrder[a.mealType] ?? 99) - (mealOrder[b.mealType] ?? 99);
  });

  const validationStartedAt = Date.now();
  try {
  if (failedChunks > 0 && firstReason !== null) {
    // Gli errori di repair sono difetti dell'output AI già classificati qui
    // sopra. Devono raggiungere il ciclo settimanale senza essere scambiati
    // per un errore del provider, così può avviarsi l'unico repair consentito.
    if (firstReason instanceof MealPlanRepairError) throw firstReason;
    throw mapOpenAiError(firstReason);
  }
  const expectedMeals = dates.length * mealTypes.length;
  const seenSlots = new Set(filtered.map((item) => `${item.date}/${item.mealType}`));
  if (filtered.length !== expectedMeals || seenSlots.size !== expectedMeals) {
    throw new MealPlanRepairError(
      filtered,
      buildMealPlanQualityCorrection(
        new AiError("AI_BAD_RESPONSE", `Piano pasti incompleto: ricevuti ${filtered.length} pasti, attesi ${expectedMeals}`),
        2,
      ),
    );
  }
   const unsuitableBreakfast = filtered.map((item) => {
     if (item.mealType !== "breakfast") return false;
     const text = [
       item.title,
       item.description,
       ...(item.ingredients || []).map((ingredient) => ingredient.name),
     ].join(" ");
     const term = savoryBreakfastTerm(text);
     return term ? { item, term } : false;
   }).find(Boolean);
   if (unsuitableBreakfast && !context.suppressInternalLogs) {
     console.warn(JSON.stringify({
       tag: "AI_MEAL_PLAN_BREAKFAST_ADVISORY",
       variant,
       term: unsuitableBreakfast.term,
     }));
   }
  const incompleteMeal = filtered.find((item) =>
    !item.title.trim() ||
    !item.description?.trim() ||
    !item.ingredients?.length ||
    !item.steps?.length ||
    item.steps.length < 3 ||
    item.steps.length > 6 ||
    item.steps.some((step) => !step?.trim()) ||
    item.ingredients.some((ingredient) =>
      !ingredient.name?.trim() || !ingredient.quantity?.trim() || !ingredient.unit?.trim()));
  if (incompleteMeal) {
    const incompleteFields = [
      !incompleteMeal.title.trim() && "title",
      !incompleteMeal.description?.trim() && "description",
      !incompleteMeal.ingredients?.length && "ingredients",
      (!incompleteMeal.steps?.length || incompleteMeal.steps.length < 3 || incompleteMeal.steps.length > 6) && "steps_count",
      incompleteMeal.steps?.some((step) => !step?.trim()) && "step_text",
      incompleteMeal.ingredients?.some((ingredient) => !ingredient.name?.trim()) && "ingredient_name",
      incompleteMeal.ingredients?.some((ingredient) => !ingredient.quantity?.trim()) && "ingredient_quantity",
      incompleteMeal.ingredients?.some((ingredient) => !ingredient.unit?.trim()) && "ingredient_unit",
    ].filter(Boolean);
    if (!context.suppressInternalLogs) {
      console.error(JSON.stringify({
        tag: "AI_MEAL_PLAN_INCOMPLETE_REJECTED",
        variant,
        fields: incompleteFields,
      }));
    }
    throw new MealPlanRepairError(
      filtered,
      buildMealPlanQualityCorrection(
        new AiError("AI_BAD_RESPONSE", "La risposta AI contiene un pasto incompleto"),
        2,
      ),
    );
  }
  const impreciseMainMeal = filtered.find((item) =>
    (item.mealType === "lunch" || item.mealType === "dinner") &&
    !(item.steps ?? []).some((step) => /\b\d+\s*(?:min(?:uto|uti)?|°\s*c|gradi)\b/i.test(step)),
  );
  if (impreciseMainMeal) {
    if (!context.suppressInternalLogs) {
      console.error(JSON.stringify({
        tag: "AI_MEAL_PLAN_IMPRECISE_RECIPE_REJECTED",
        variant,
        mealType: impreciseMainMeal.mealType,
      }));
    }
    throw new MealPlanRepairError(
      filtered,
      buildMealPlanQualityCorrection(
        new AiError("AI_BAD_RESPONSE", "La ricetta non indica un tempo o temperatura di cottura"),
        2,
      ),
    );
  }
   const unexpectedWholegrain = !glutenFreeRequired && !wantsWholegrain
    ? filtered.find((item) => /\bintegral(?:e|i)?\b/i.test([
      item.title,
      item.description,
      ...(item.ingredients || []).map((ingredient) => ingredient.name),
      ...(item.steps || []),
    ].join(" ")))
    : undefined;
   if (unexpectedWholegrain && !context.suppressInternalLogs) {
     console.warn(JSON.stringify({
       tag: "AI_MEAL_PLAN_WHOLEGRAIN_ADVISORY",
       variant,
       mealType: unexpectedWholegrain.mealType,
     }));
   }
  context.onStatus?.("Controllo che ogni pasto rispetti i vincoli alimentari.");
  const constraintViolations = validateMealPlanConstraints(filtered, context.preferences);
  if (constraintViolations.length > 0) {
    const violationCodes = Array.from(new Set(constraintViolations.map((violation) => violation.code)));
    if (!context.suppressInternalLogs) {
      console.error(JSON.stringify({
        tag: "AI_MEAL_PLAN_CONSTRAINT_REJECTED",
        variant,
        violations: violationCodes,
        matchedTerms: Array.from(new Set(
          constraintViolations
            .map((violation) => violation.matched)
            .filter((term): term is string => !!term),
        )).slice(0, 12),
      }));
    }
    // È telemetria server-side best-effort: un observer non deve poter
    // interrompere né alterare il percorso di sicurezza della generazione.
    try {
      context.onConstraintViolation?.({
        attempt: context.generationAttempt,
        violationCodes,
      });
    } catch {
      /* callback osservativa: ignora errori */
    }
    throw new MealPlanConstraintRetryError(constraintViolations, filtered);
  }
  const glutenFreePastaPattern = /\bpasta(?:\s+di\s+(?:mais|riso))?\s+(?:senza\s+glutine|gluten\s+free)\b/i;
  const hasWeeklyGlutenFreePasta = !glutenFreeRequired || filtered.some((item) =>
    item.mealType === "lunch" &&
    glutenFreePastaPattern.test([
      item.title,
      item.description,
      ...(item.ingredients || []).map((ingredient) => ingredient.name),
      ...(item.steps || []),
    ].join(" ")),
  );
  if (!hasWeeklyGlutenFreePasta) {
    throw new MealPlanRepairError(
      filtered,
      `
- CORREZIONE DIETETICA OBBLIGATORIA: il piano senza glutine deve contenere almeno un pranzo con pasta senza glutine. Usa “pasta senza glutine”, “pasta di mais senza glutine” oppure “pasta di riso senza glutine” in titolo e ingredienti.`,
    );
  }
  const mediterraneanQuality = mediterraneanDiet
    ? evaluateMediterraneanMealPlan(filtered)
    : undefined;
  if (mediterraneanQuality?.issues.length) {
    const issueCodes = mediterraneanQuality.issues.map((issue) => issue.code);
    if (!context.suppressInternalLogs) {
      console.warn(JSON.stringify({
        tag: "AI_MEAL_PLAN_MEDITERRANEAN_ADVISORY",
        variant,
        issues: issueCodes,
        pastaLunchCount: mediterraneanQuality.pastaLunchCount,
        redMeatMealCount: mediterraneanQuality.redMeatMealCount,
        legumeMainMealCount: mediterraneanQuality.legumeMainMealCount,
        fishMainMealCount: mediterraneanQuality.fishMainMealCount,
        whiteMeatMainMealCount: mediterraneanQuality.whiteMeatMainMealCount,
        eggMainMealCount: mediterraneanQuality.eggMainMealCount,
        distinctLunchFamilies: mediterraneanQuality.distinctLunchFamilies,
      }));
    }
  }
   const redMeatEvaluation = evaluateMealPlanRedMeat(filtered);
   if (requiresMediterraneanRedMeat && !redMeatEvaluation.hasRedMeat && !context.suppressInternalLogs) {
     console.warn(JSON.stringify({
       tag: "AI_MEAL_PLAN_RED_MEAT_ADVISORY",
       variant,
       mainMealCount: redMeatEvaluation.mainMealCount,
       redMeatMealCount: redMeatEvaluation.redMeatMealCount,
     }));
   }

  const repeatedSlots = findRepeatedMealSlots(disambiguateMealTitles(filtered));
  const finalItems = disambiguateMealTitles(filtered);
  const repeatedConcepts = findRepeatedMealConcepts(finalItems);
  const varietyEvaluation = evaluateMealPlanVariety(finalItems);
   if (repeatedSlots.length > 0 && !context.suppressInternalLogs) {
     console.warn(JSON.stringify({
       tag: "AI_MEAL_PLAN_DUPLICATE_ADVISORY",
       variant,
       slotCount: repeatedSlots.length,
     }));
   }
  if (repeatedConcepts.length > 0) {
    if (!context.suppressInternalLogs) {
      console.warn(JSON.stringify({
        tag: "AI_MEAL_PLAN_VARIETY_BEST_EFFORT",
        variant,
        repeatedCount: repeatedConcepts.length,
      }));
    }
  }
  if (varietyEvaluation.issues.length > 0 && !context.suppressInternalLogs) {
    console.info(JSON.stringify({
      tag: "AI_MEAL_PLAN_VARIETY_ADVISORY",
      variant,
      issues: varietyEvaluation.issues.map((issue) => issue.code),
      carbohydrateSources: varietyEvaluation.distinctCarbohydrateSources,
    }));
  }
  const finalMediterraneanQuality = mediterraneanDiet
    ? evaluateMediterraneanMealPlan(finalItems)
    : undefined;
  if (finalMediterraneanQuality?.issues.length) {
    const issueCodes = finalMediterraneanQuality.issues.map((issue) => issue.code);
    if (!context.suppressInternalLogs) {
      console.warn(JSON.stringify({
        tag: "AI_MEAL_PLAN_MEDITERRANEAN_FINAL_ADVISORY",
        variant,
        issues: issueCodes,
      }));
    }
  }
  const finalRedMeatEvaluation = evaluateMealPlanRedMeat(finalItems);
   if (requiresMediterraneanRedMeat && !finalRedMeatEvaluation.hasRedMeat && !context.suppressInternalLogs) {
     console.warn(JSON.stringify({
       tag: "AI_MEAL_PLAN_RED_MEAT_FINAL_ADVISORY",
       variant,
       mainMealCount: finalRedMeatEvaluation.mainMealCount,
       redMeatMealCount: finalRedMeatEvaluation.redMeatMealCount,
     }));
   }

  if (context.onProgress) {
    for (const date of dates) {
      const dayItems = finalItems.filter((item) => item.date === date);
      if (dayItems.length > 0) {
        try { context.onProgress(dayItems); } catch {}
      }
    }
  }

  return { title: 'Piano Settimanale', items: finalItems };
  } finally {
    const durationMs = Date.now() - attemptStartedAt;
    const validationDurationMs = Date.now() - validationStartedAt;
    const preparationDurationMs = firstProviderStartedAt === null
      ? durationMs
      : firstProviderStartedAt - attemptStartedAt;
    try {
      context.onAttemptTelemetry?.({
        generationAttempt: context.generationAttempt,
        durationMs,
        providerDurationMs,
        responseChars,
        finishReasons: Array.from(new Set(finishReasons)),
        itemsCount: filtered.length,
        failedChunks,
      });
    } catch {}
    if (!context.suppressInternalLogs) {
      recordMealPlanLatency({
        mode: standardPlan ? 'standard' : 'constrained',
        durationMs,
        modelCalls: modelCallsStarted,
        modelCallBudget: context.modelCallBudget?.maxCalls ?? MAX_MEAL_PLAN_MODEL_CALLS,
        preparationDurationMs,
        providerDurationMs,
        parsingDurationMs,
        validationDurationMs,
        responseChars,
        repairAttempt: context.generationAttempt > 1,
      });
      console.log(JSON.stringify({
        tag: "AI_MEAL_PLAN_CALL",
        variant,
        mode: standardPlan ? "standard" : "constrained",
        generationAttempt: context.generationAttempt,
        durationMs,
        preparationDurationMs,
        providerDurationMs,
        parsingDurationMs,
        validationDurationMs,
        responseChars,
        repairAttempt: context.generationAttempt > 1,
        modelCalls: modelCallsStarted,
        chunks: weeklyRequests.length,
        failedChunks,
        itemsCount: filtered.length,
        finishReasons: Array.from(new Set(finishReasons)),
      }));
    }
  }
}

export async function generateWeeklyMealPlan(
  context: MealPlanGenerationContext,
): Promise<MealPlanSuggestion> {
  const generationContext: MealPlanGenerationContext = {
    ...context,
    preferences: normalizeMealPlanGenerationPreferences(context.preferences),
  };
  // Difesa in profondità per eventuali chiamanti interni che bypassassero la
  // preparazione HTTP: una nota sanitaria non traducibile in regole
  // verificabili non deve mai raggiungere OpenAI come preferenza generica.
  const unsupportedHealthNote = unsupportedMealPlanHealthNote(generationContext.preferences);
  if (unsupportedHealthNote) {
    throw new AiError("AI_CONSTRAINT_VIOLATION", unsupportedHealthNote);
  }
  const requestedLimit = Number.isFinite(context.maxConstraintAttempts)
    ? Math.floor(context.maxConstraintAttempts!)
    : MAX_CONSTRAINT_GENERATION_ATTEMPTS;
  // Primo tentativo + al massimo un repair. Questo conta le chiamate
  // applicative, indipendentemente dai retry di trasporto interni all'SDK.
  const attempts = Math.max(1, Math.min(MEAL_PLAN_MAX_GENERATION_ATTEMPTS, requestedLimit));
  const requestedModelCalls = Number.isFinite(context.maxModelCalls)
    ? Math.floor(context.maxModelCalls!)
    : MAX_MEAL_PLAN_MODEL_CALLS;
  const modelCallBudget = {
    maxCalls: Math.max(1, Math.min(MAX_MEAL_PLAN_MODEL_CALLS, requestedModelCalls)),
    usedCalls: 0,
  };
  const fullAttemptCallCost = mealPlanAttemptModelCallCost(generationContext);
  let repair: { items: MealPlanSuggestion["items"]; correction: string } | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (!canAffordMealPlanModelCalls(modelCallBudget, fullAttemptCallCost)) {
      throw modelCallBudgetExhaustedError(modelCallBudget);
    }
    try {
      generationContext.onStatus?.(
        attempt === 1
          ? "Compongo le 21 ricette della settimana."
          : "Correggo solo gli errori rilevati e ricontrollo il piano.",
      );
      return await generateWeeklyMealPlanAttempt({
        ...generationContext,
        generationAttempt: attempt,
        constraintCorrection: repair?.correction,
        // Le colazioni dei profili esclusivi sono locali e già verificate:
        // non entrano nel JSON da correggere, quindi il repair vede soltanto
        // i 14 slot che può davvero modificare.
        previousPlanJson: repair
          ? JSON.stringify({
            items: repair.items.filter((item) =>
              !(
                item.mealType === "breakfast"
                && (
                  mealPlanRequiresGlutenFree(generationContext.preferences)
                  || mealPlanHasExclusion(generationContext.preferences, "lactose")
                )
              )),
          })
          : undefined,
        modelCallBudget,
      });
    } catch (error) {
      const recoverable = error instanceof MealPlanRepairError
        ? { items: error.items, correction: error.correction }
        : error instanceof MealPlanConstraintRetryError
          ? { items: error.items, correction: buildConstraintCorrection(error.violations, attempt + 1) }
          : undefined;
      if (!recoverable || attempt >= attempts) {
        if (error instanceof MealPlanConstraintRetryError) {
          throw new AiError(
            "AI_CONSTRAINT_VIOLATION",
            `Piano pasti rifiutato dopo ${attempt} tentativi: ${error.violations.map((violation) => violation.code).join(",")}`,
          );
        }
        if (error instanceof MealPlanRepairError) {
          throw new AiError(
            "AI_BAD_RESPONSE",
            `Piano pasti non valido dopo ${attempt} tentativi`,
          );
        }
        throw error;
      }
      repair = recoverable;
      if (!generationContext.suppressInternalLogs) {
        console.warn(JSON.stringify({
          tag: "AI_MEAL_PLAN_SINGLE_REPAIR",
          variant: context.planVariant || 1,
          failedAttempt: attempt,
          nextAttempt: attempt + 1,
          correction: error instanceof MealPlanConstraintRetryError
            ? Array.from(new Set(error.violations.map((violation) => violation.code)))
            : ["quality_or_variety"],
        }));
      }
    }
  }

  throw new AiError("AI_CONSTRAINT_VIOLATION", "Nessun piano pasti conforme generato");
}

export async function generateFamilyInsights(context: {
  events: number;
  completedChores: number;
  pendingChores: number;
  topContributor: string;
  weeklyPoints: number;
  provider?: AiProvider;
}) {
  assertAiConfigured(context.provider);
  try {
    const response = await getOpenAiClient(context.provider).chat.completions.create({
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
  provider?: AiProvider;
}) {
  assertAiConfigured(context.provider);
  try {
    const response = await getOpenAiClient(context.provider).chat.completions.create({
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
  provider?: AiProvider;
}): Promise<{ text: string }> {
  assertAiConfigured(input.provider);
  try {
    const file = await toFile(input.buffer, input.filename, { type: input.mimeType });
    // Il prompt orienta il modello sul lessico atteso (italiano, dominio famiglia)
    // e riduce gli errori su nomi, date e orari. NIENTE frasi d'esempio: il
    // modello le "echeggia" o ne inventa di simili sugli audio brevi.
    const baseHint =
      'Dettatura vocale in italiano per un\'app di famiglia. Trascrivi fedelmente solo le parole pronunciate.';
    const extra = (input.context || '').trim().slice(0, 300);
    // Audio molto brevi (1-2 parole): il CONTESTO di dominio fa più danni che
    // benefici, il modello tende ad allucinare parole del dominio ("incontro"
    // al posto di "cena"). Sotto la soglia si invia SOLO l'hint di base
    // (lingua italiana, nessun sostantivo di dominio): senza alcun prompt il
    // modello inventava parole inesistenti ("Mastakolezardem" per "pasta con
    // le sarde").
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
    const sentPrompt = isShortClip ? baseHint : (extra ? `${baseHint} ${extra}` : baseHint);
    const response = await getOpenAiClient(input.provider).audio.transcriptions.create({
      file,
      model: 'gpt-4o-transcribe',
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
  provider?: AiProvider;
}): Promise<Buffer> {
  assertAiConfigured(input.provider);
  try {
    const details = input.description ? ` ${input.description}` : '';
    const prompt =
      `Fotografia food professionale del piatto italiano "${input.title}".${details} ` +
      `Piatto ben impiattato su un tavolo, luce naturale, inquadratura dall'alto leggermente angolata, ` +
      `sfondo semplice e pulito, aspetto appetitoso e realistico. Nessun testo, nessuna scritta, nessuna persona.`;
    const response = await getOpenAiClient(input.provider).images.generate({
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
  // Ulteriori date puntuali (oltre a "date") quando il testo cita più giorni
  // SENZA ricorrenza (es. "giovedì e venerdì prossimo" = 2 eventi singoli).
  extraDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).catch([]),
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
  provider?: AiProvider;
}): Promise<ParsedEvent> {
  assertAiConfigured(input.provider);
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient(input.provider).chat.completions.create({
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
- ATTENZIONE: l'evento è ricorrente SOLO se il testo lo dice chiaramente ("ogni", "tutti i", "ogni settimana/mese"). Se il testo cita più giorni SENZA parole di ricorrenza (es. "giovedì e venerdì prossimo", "lunedì e mercoledì della prossima settimana"), NON è ricorrente: "repeat" DEVE essere null, "date" è la prima delle date citate e "extraDates" contiene le altre date (YYYY-MM-DD). Se c'è una sola data o c'è "repeat", "extraDates" è [].
- "<giorno> prossimo" o "<giorno> della prossima settimana" = quel giorno della SETTIMANA PROSSIMA (non il primo futuro se cade in questa settimana).
- Con "repeat", "date" è la PRIMA occorrenza futura coerente con la regola (es. il prossimo martedì).
${memberList.length > 0 ? `- "assigneeName": se il testo dice a chi è assegnato/di chi è l'evento (es. "per Marco", "assegnalo a Anna", "porta Luca a calcio"), oppure se un membro è il PROTAGONISTA dell'evento (es. "Francesco ha lezione di matematica", "visita dal dentista di Anna" → l'evento è SUO), scegli il nome ESATTO più vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde. Un nome citato solo come compagnia (es. "cena CON Marco") non è un assegnatario a meno che non sia nella lista e il contesto lo suggerisca.` : '- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"title": "...", "location": ..., "description": ..., "date": ..., "extraDates": [...], "time": ..., "endTime": ..., "repeat": ..., "weekdays": [...], "monthDays": [...], "assigneeName": ...}`,
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
  provider?: AiProvider;
}): Promise<ParsedChore> {
  assertAiConfigured(input.provider);
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient(input.provider).chat.completions.create({
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

export async function parseExpenseFromText(
  text: string,
  provider: AiProvider = "replit_managed",
): Promise<ParsedExpense> {
  assertAiConfigured(provider);
  try {
    const response = await getOpenAiClient(provider).chat.completions.create({
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

/**
 * Assistente Home: estrae da UNA frase (o dettatura) in italiano una LISTA di
 * azioni da creare nelle varie sezioni dell'app (faccende, eventi, spesa,
 * bollette, premi, pasti). La quota è gestita dalla rotta con withAiUsage.
 * Riusa gli stessi schemi "tolleranti" (catch) dei parser singoli: campi
 * malformati diventano null/[] invece di far fallire tutta la risposta.
 */
const assistantShoppingItemSchema = z.object({
  name: z.string().catch(''),
  quantity: z.number().positive().max(100000).nullable().catch(null),
  unit: z.enum(['pcs', 'g', 'kg', 'ml', 'l']).nullable().catch(null),
});

const assistantBillSchema = z.object({
  title: z.string().catch(''),
  amount: z.number().min(0).max(1000000).nullable().catch(null),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  category: z.enum(['luce', 'gas', 'acqua', 'telefono', 'scuola', 'assicurazione', 'tasse', 'altro']).nullable().catch(null),
});

const assistantRewardSchema = z.object({
  title: z.string().catch(''),
  description: z.string().nullable().catch(null),
  pointsCost: z.number().int().min(1).max(100000).nullable().catch(null),
});

const assistantMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullable().catch(null),
  title: z.string().catch(''),
});

const assistantActionsSchema = z.object({
  events: z.array(parsedEventSchema).max(10).catch([]),
  chores: z.array(parsedChoreSchema).max(10).catch([]),
  shoppingItems: z.array(assistantShoppingItemSchema).max(20).catch([]),
  bills: z.array(assistantBillSchema).max(10).catch([]),
  rewards: z.array(assistantRewardSchema).max(10).catch([]),
  meals: z.array(assistantMealSchema).max(15).catch([]),
  // Richiesta generica di GENERARE un piano pasti settimanale (es. "piano
  // pasti mediterraneo"): non è un pasto singolo, va gestita a parte.
  mealPlanRequest: z.object({ notes: z.string().max(300).catch('') }).nullable().catch(null),
});

export type AssistantActions = z.infer<typeof assistantActionsSchema>;

export async function parseAssistantActionsFromText(input: {
  text: string;
  todayIso: string;
  weekdayName: string;
  memberNames?: string[];
  provider?: AiProvider;
}): Promise<AssistantActions> {
  assertAiConfigured(input.provider);
  const memberList = (input.memberNames ?? []).slice(0, 20).map((n) => n.slice(0, 60));
  try {
    const response = await getOpenAiClient(input.provider).chat.completions.create({
      model: 'gpt-5-mini',
      // 'low' (non 'minimal'): l'assistente smista frasi complesse in più
      // azioni; un minimo di ragionamento riduce molto gli errori di
      // interpretazione (date, assegnatari, sezione giusta) con ~1-2s in più.
      reasoning_effort: 'low',
      messages: [{
        role: 'system',
        content: `Sei l'assistente di un'app di organizzazione familiare. Da una frase in italiano estrai TUTTE le cose da creare, smistandole nelle liste giuste. Una frase può contenere più cose insieme.

REGOLE GENERALI:
- Oggi è ${input.todayIso} (${input.weekdayName}), fuso orario Europe/Rome. Risolvi date relative ("domani", "venerdì", "il 15") in date assolute FUTURE (mai nel passato).
- Metti in ogni lista SOLO ciò che l'utente chiede davvero di aggiungere. Liste vuote [] se non pertinente.
- NON inventare dati non presenti nel testo: i campi non indicati restano null.

"events" (eventi calendario: appuntamenti, visite, sport, compleanni, promemoria con data/ora):
- oggetti {"title","location","description","date","time","endTime","repeat","weekdays","monthDays","assigneeName"}
- "date" YYYY-MM-DD solo se il testo indica un giorno; "time"/"endTime" HH:MM (24h) o null.
- "repeat": "daily"|"weekly"|"monthly"|null; "weekdays" numeri ISO 1=lunedì..7=domenica; "monthDays" 1-31; altrimenti [].

"chores" (faccende domestiche/compiti da fare in casa):
- oggetti {"title","description","points","difficulty","estimatedMinutes","dueDate","repeat","weekdays","monthDays","assigneeName"}
- "points" 1-100 solo se indicati; "dueDate" solo per scadenza singola esplicita; ricorrenze come per gli eventi.

"shoppingItems" (cose da comprare / lista della spesa):
- oggetti {"name","quantity","unit"}; "quantity" numero o null; "unit" tra "pcs" (pezzi),"g","kg","ml","l" o null.

"bills" (bollette/pagamenti da ricordare: luce, gas, affitto, rate):
- oggetti {"title","amount","dueDate","category"}; "amount" in euro o null; "category" tra "luce","gas","acqua","telefono","scuola","assicurazione","tasse","altro" o null.

"rewards" (premi/badge riscattabili con i punti, es. "premio gelato da 50 punti"):
- oggetti {"title","description","pointsCost"}.

"meals" (pasti SINGOLI e specifici, es. "sabato a cena lasagne"):
- oggetti {"date","mealType","title"}; "mealType" tra "breakfast","lunch","dinner","snack".

"mealPlanRequest" (l'utente chiede di CREARE/GENERARE un piano pasti settimanale intero, senza indicare i singoli piatti, es. "piano pasti mediterraneo", "creami il piano pasti della settimana"):
- oggetto {"notes"} dove "notes" riassume le preferenze espresse (es. "mediterraneo", "vegetariano senza glutine") o "" se nessuna; null se non richiesto. In questo caso NON riempire "meals".
${memberList.length > 0 ? `\n- "assigneeName" (eventi e faccende): se il testo dice a chi è assegnato (es. "per Marco", "tocca a Anna"), scegli il nome ESATTO più vicino da questa lista: ${JSON.stringify(memberList)}. null se non indicato o nessun nome corrisponde.` : '\n- "assigneeName": sempre null.'}
- Rispondi SOLO con JSON: {"events":[...],"chores":[...],"shoppingItems":[...],"bills":[...],"rewards":[...],"meals":[...],"mealPlanRequest":{...}|null}`,
      }, {
        role: 'user',
        content: input.text,
      }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = assistantActionsSchema.parse(JSON.parse(content));

    // Scarta le voci senza nemmeno il titolo/nome (inutilizzabili a valle).
    parsed.events = parsed.events.filter((e) => e.title.trim().length > 0);
    parsed.chores = parsed.chores.filter((c) => c.title.trim().length > 0);
    parsed.shoppingItems = parsed.shoppingItems.filter((s) => s.name.trim().length > 0);
    parsed.bills = parsed.bills.filter((b) => b.title.trim().length > 0);
    parsed.rewards = parsed.rewards.filter((r) => r.title.trim().length > 0);
    parsed.meals = parsed.meals.filter((m) => m.title.trim().length > 0);

    // Nessuna azione estratta: errore tipizzato, così il client non mostra un
    // falso successo con un riepilogo vuoto.
    const total = parsed.events.length + parsed.chores.length + parsed.shoppingItems.length
      + parsed.bills.length + parsed.rewards.length + parsed.meals.length
      + (parsed.mealPlanRequest ? 1 : 0);
    if (total === 0) {
      throw new AiError('AI_BAD_RESPONSE', 'assistant-parse: nessuna azione estratta dal testo');
    }

    return parsed;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw mapOpenAiError(error);
  }
}
