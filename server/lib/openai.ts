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
