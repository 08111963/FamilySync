import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function generateShoppingSuggestions(context: {
  familySize: number;
  recentPurchases: string[];
  upcomingEvents: string[];
  season: string;
}) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Sei un assistente per la lista della spesa al supermercato italiano.

REGOLE TASSATIVE:
- Suggerisci SOLO prodotti alimentari che si comprano al supermercato: frutta, verdura, carne, pesce, latticini, pane, pasta, riso, condimenti, surgelati, bevande, snack, cereali, legumi, uova, farina, olio, ecc.
- VIETATO suggerire: vestiti, scarpe, candele, libri, elettronica, hobby, detersivi, prodotti per la casa, igiene personale o qualsiasi cosa NON alimentare.
- Le motivazioni devono essere pratiche e concrete (es. "da abbinare con la pasta", "ricco di proteine", "ottimo per la colazione"), MAI generiche o legate alle stagioni in modo banale.
- Suggerisci prodotti specifici (es. "Mozzarella di bufala" non "Latticini", "Petto di pollo" non "Carne").`,
      }, {
        role: 'user',
        content: `Famiglia di ${context.familySize} persone.${context.recentPurchases.length > 0 ? ` Hanno comprato di recente: ${context.recentPurchases.join(', ')}.` : ''} ${context.upcomingEvents.length > 0 ? `Eventi in programma: ${context.upcomingEvents.join(', ')}.` : ''} Suggerisci 10 prodotti alimentari da comprare al supermercato. Rispondi SOLO con JSON: {"suggestions": [{"name": "prodotto specifico", "reason": "motivazione pratica e concreta"}]}`,
      }],
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0].message.content || '{"items": []}';
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI error:', error);
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
