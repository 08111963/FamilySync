import test from 'node:test';
import assert from 'node:assert/strict';

// Regressione del bug di produzione (4 ago 2026): l'utente sceglieva il
// giorno 8 dal calendario, poi usava "Compila con AI" con un testo SENZA data
// (es. "Andare a prendere Cicla all'aeroporto alle 16") e l'AI restituiva la
// data di OGGI, sovrascrivendo quella già scelta. Il prompt è stato corretto
// ("date" null se il testo non menziona una data), ma il comportamento
// dipende dal modello: questi test chiamano l'AI REALE per verificare che
// il contratto regga nel tempo.
//
// Senza chiave AI configurata i test vengono SKIPPATI (nessun mock: un mock
// non coprirebbe la regressione, che sta nel comportamento del modello).

import { resolveOpenAiConfig } from '../lib/ai-errors';
import { parseEventFromText } from '../lib/openai';

const { apiKey } = resolveOpenAiConfig();
const hasAi = Boolean(apiKey);
const SKIP_MSG = 'chiave AI non configurata (OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY): test con modello reale saltato';

// Contesto fisso e riproducibile: "oggi" è il 4 agosto 2026 (martedì),
// come nel bug originale.
const TODAY = { todayIso: '2026-08-04', weekdayName: 'martedì' };

test('parse-event AI reale: testo con solo orario -> date null (non oggi)', { skip: hasAi ? false : SKIP_MSG }, async () => {
  const parsed = await parseEventFromText({
    text: 'Andare a prendere Cicla all\'aeroporto alle 16',
    ...TODAY,
  });

  // Il campo critico: nessuna data nel testo => date DEVE restare null.
  // In particolare NON deve essere la data di oggi (la regressione originale).
  assert.equal(parsed.date, null, `date deve essere null, ricevuto ${JSON.stringify(parsed.date)}`);
  // Sanity: l'orario indicato va comunque estratto.
  assert.equal(parsed.time, '16:00');
  assert.ok(parsed.title.trim().length > 0, 'il titolo deve essere compilato');
});

test('parse-event AI reale: "giorno 8" -> data 8 del mese giusto', { skip: hasAi ? false : SKIP_MSG }, async () => {
  const parsed = await parseEventFromText({
    text: 'Andare a prendere Cicla all\'aeroporto giorno 8 alle 16',
    ...TODAY,
  });

  // Oggi è il 4 agosto 2026: "giorno 8" è l'8 agosto 2026 (futuro, stesso mese).
  assert.equal(parsed.date, '2026-08-08', `attesa 2026-08-08, ricevuto ${JSON.stringify(parsed.date)}`);
  assert.equal(parsed.time, '16:00');
});

test('parse-event AI reale: testo senza data né orario -> date null', { skip: hasAi ? false : SKIP_MSG }, async () => {
  const parsed = await parseEventFromText({
    text: 'Andare a prendere Cicla all\'aeroporto',
    ...TODAY,
  });

  assert.equal(parsed.date, null, `date deve essere null, ricevuto ${JSON.stringify(parsed.date)}`);
  assert.equal(parsed.time, null, `time deve essere null, ricevuto ${JSON.stringify(parsed.time)}`);
  assert.ok(parsed.title.trim().length > 0, 'il titolo deve essere compilato');
});
