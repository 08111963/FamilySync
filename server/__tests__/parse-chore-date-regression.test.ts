import test from 'node:test';
import assert from 'node:assert/strict';

// Stesso bug di produzione corretto per gli eventi (4 ago 2026): con
// "Compila con AI" su un testo SENZA data l'AI restituiva la data di OGGI,
// sovrascrivendo la scadenza già scelta dall'utente. Per le faccende il
// prompt di parseChoreFromText impone "dueDate" null se il testo non
// menziona una data, ma il comportamento dipende dal modello: questi test
// chiamano l'AI REALE per verificare che il contratto regga nel tempo.
//
// Senza chiave AI configurata i test vengono SKIPPATI (nessun mock: un mock
// non coprirebbe la regressione, che sta nel comportamento del modello).

import { resolveOpenAiConfig } from '../lib/ai-errors';
import { parseChoreFromText } from '../lib/openai';

const { apiKey } = resolveOpenAiConfig();
const hasAi = Boolean(apiKey);
const SKIP_MSG = 'chiave AI non configurata (OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY): test con modello reale saltato';

// Contesto fisso e riproducibile: "oggi" è il 4 agosto 2026 (martedì),
// come nel bug originale degli eventi.
const TODAY = { todayIso: '2026-08-04', weekdayName: 'martedì' };

test('parse-chore AI reale: testo senza data -> dueDate null (non oggi)', { skip: hasAi ? false : SKIP_MSG }, async () => {
  const parsed = await parseChoreFromText({
    text: 'Buttare la spazzatura, vale 10 punti',
    ...TODAY,
  });

  // Il campo critico: nessuna data nel testo => dueDate DEVE restare null.
  // In particolare NON deve essere la data di oggi (la regressione originale
  // sovrascriverebbe la scadenza già scelta dall'utente nel form).
  assert.equal(parsed.dueDate, null, `dueDate deve essere null, ricevuto ${JSON.stringify(parsed.dueDate)}`);
  // Sanity: gli altri campi indicati vanno comunque estratti.
  assert.equal(parsed.points, 10);
  assert.ok(parsed.title.trim().length > 0, 'il titolo deve essere compilato');
});

test('parse-chore AI reale: "giorno 8" -> dueDate 8 del mese giusto', { skip: hasAi ? false : SKIP_MSG }, async () => {
  const parsed = await parseChoreFromText({
    text: 'Pulire il garage entro giorno 8',
    ...TODAY,
  });

  // Oggi è il 4 agosto 2026: "giorno 8" è l'8 agosto 2026 (futuro, stesso mese).
  assert.equal(parsed.dueDate, '2026-08-08', `attesa 2026-08-08, ricevuto ${JSON.stringify(parsed.dueDate)}`);
  assert.ok(parsed.title.trim().length > 0, 'il titolo deve essere compilato');
});
