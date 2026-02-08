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

const recipeSuggestionSchema = z.object({
  recipes: z.array(z.object({
    title: z.string(),
    description: z.string(),
    servings: z.number().catch(4),
    prepTimeMinutes: z.number().catch(15),
    cookTimeMinutes: z.number().catch(30),
    steps: z.array(z.string()),
    tags: z.object({
      diet: z.array(z.string()).optional(),
      allergens: z.array(z.string()).optional(),
      cuisine: z.string().optional(),
      difficulty: z.string().optional(),
    }).catch({}),
    ingredients: z.array(z.object({
      name: z.string(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
    })),
  })),
}).catch({ recipes: [] });

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
  const count = context.count || 12;
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

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Sei uno chef italiano esperto di cucina familiare. Genera ricette pratiche e gustose.

REGOLE TASSATIVE:
- Genera ESATTAMENTE ${count} ricette TUTTE DIVERSE tra loro.
- Ogni ricetta deve avere un'IDEA DIVERSA (non varianti minime dello stesso piatto).
- VARIETÀ obbligatoria: alterna proteine animali/vegetariano, tipologie (pasta, riso, zuppa, forno, insalata, pesce, carne, legumi), tecniche (padella, forno, vapore, crudo).
- Nomi generici senza brand commerciali.
- Ogni ricetta deve avere: title, description (2-3 frasi), servings, prepTimeMinutes, cookTimeMinutes, steps (array di stringhe dettagliate), tags, ingredients.
- tags deve avere: diet (array, es ["vegetariano"]), allergens (array), cuisine (stringa, es "italiana"), difficulty (stringa: "facile"|"media"|"difficile").
- ingredients deve avere: name, quantity (come stringa es "200"), unit (una tra: g, kg, ml, l, pcs, tbsp, tsp, cup, pinch, to_taste), notes (opzionale), category (es: "latticini", "verdure", "carne", "pesce", "pasta", "condimenti", "frutta").
- Rispondi SOLO con JSON: {"recipes": [...]}`,
      }, {
        role: 'user',
        content: `[seed:${randomSeed}] Famiglia di ${context.familySize} persone.${dietText}${allergyText}${timeText}${cuisineText}${excludeText}${lastTitlesText}

Genera ${count} ricette italiane TUTTE DIVERSE per la famiglia.`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      presence_penalty: 0.9,
      frequency_penalty: 0.4,
    });

    const content = response.choices[0].message.content || '{"recipes": []}';
    return recipeSuggestionSchema.parse(JSON.parse(content));
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
}): Promise<MealPlanSuggestion> {
  const mealsPerDay = context.preferences?.mealsPerDay || 3;
  const mealTypes = mealsPerDay >= 4
    ? ['breakfast', 'lunch', 'dinner', 'snack']
    : mealsPerDay >= 3
      ? ['breakfast', 'lunch', 'dinner']
      : ['lunch', 'dinner'];

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
- Rispondi con JSON: {"title": "Piano Settimanale [data]", "items": [...]}`,
      }, {
        role: 'user',
        content: `Famiglia di ${context.familySize} persone. Settimana dal ${dates[0]} al ${dates[6]}.${prefText}\n\nGenera il piano pasti settimanale.`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content || '{"title":"","items":[]}';
    return mealPlanSchema.parse(JSON.parse(content));
  } catch (error) {
    console.error('OpenAI meal plan error:', error);
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
