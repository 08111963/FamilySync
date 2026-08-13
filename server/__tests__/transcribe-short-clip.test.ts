import test from 'node:test';
import assert from 'node:assert/strict';

// Chiave finta: serve solo a superare assertAiConfigured(); il client OpenAI
// vero non viene mai creato perché lo iniettiamo noi con il mock.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-real';

import { transcribeAudio, __setOpenAiClientForTest } from '../lib/openai';

import {
  SHORT_CLIP_MAX_BYTES,
  SHORT_CLIP_MAX_DURATION_MS,
  isDurationPlausible,
  PLAUSIBLE_MIN_BYTES_PER_SEC,
  PLAUSIBLE_MAX_BYTES_PER_SEC,
} from '../lib/openai';

// Soglia in byte sotto la quale l'audio viene trascritto con il SOLO hint di
// base (niente contesto di dominio) quando il client non fornisce la durata.
const SHORT_CLIP_THRESHOLD = SHORT_CLIP_MAX_BYTES;

// Hint di base che il server invia sempre (anche per i clip brevi): lingua
// italiana, nessun sostantivo di dominio. Deve restare allineato a openai.ts.
const BASE_HINT =
  'Dettatura vocale in italiano per un\'app di famiglia. Trascrivi fedelmente solo le parole pronunciate.';

type CreateArgs = { prompt?: string; [k: string]: unknown };

function makeFakeClient(respond: (args: CreateArgs) => string) {
  const calls: CreateArgs[] = [];
  const client = {
    audio: {
      transcriptions: {
        create: async (args: CreateArgs) => {
          calls.push(args);
          return { text: respond(args) };
        },
      },
    },
  };
  return { client, calls };
}

function buffersOf(size: number): Buffer {
  return Buffer.alloc(size, 1);
}

test('audio corto sotto soglia: prompt = solo hint di base, SENZA contesto di dominio', async (t) => {
  const { client, calls } = makeFakeClient(() => 'cena');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Evento del calendario familiare: titolo, luogo, data e orario.';
  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD - 1),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, BASE_HINT, 'per i clip brevi va inviato il solo hint di base');
  assert.ok(!(calls[0].prompt as string).includes(context), 'niente contesto di dominio sui clip brevi');
  assert.equal(result.text, 'cena');
});

test('audio sopra soglia: il prompt viene inviato e include il contesto', async (t) => {
  const { client, calls } = makeFakeClient(() => 'Cena con Marco venerdì alle 20');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Evento del calendario familiare: titolo, luogo, data e orario.';
  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
  });

  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].prompt, 'string');
  assert.ok((calls[0].prompt as string).length > 0, 'il prompt deve essere presente sopra soglia');
  assert.ok(
    (calls[0].prompt as string).includes(context),
    'il prompt deve includere il contesto fornito'
  );
  assert.equal(result.text, 'Cena con Marco venerdì alle 20');
});

test('audio sopra soglia senza contesto: prompt = solo hint di base', async (t) => {
  const { client, calls } = makeFakeClient(() => 'ciao');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD + 1),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
  });

  const prompt = calls[0].prompt as string;
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0, 'il prompt di base deve esserci anche senza contesto');
  assert.ok(
    !prompt.includes('venerdì alle 20"'),
    'il prompt non deve contenere frasi d\'esempio (rischio eco)'
  );
});

test('anti-eco usa il prompt effettivamente inviato: eco del prompt -> testo vuoto', async (t) => {
  // Il mock risponde restituendo esattamente il prompt che ha ricevuto,
  // simulando il caso "audio vuoto -> il modello echeggia il prompt".
  const { client, calls } = makeFakeClient((args) => args.prompt || 'silenzio');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD + 5_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context: 'Lista della spesa della famiglia.',
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].prompt, 'sopra soglia il prompt deve esserci');
  assert.equal(result.text, '', 'l\'eco del prompt inviato deve essere scartata');
});

test('durata fornita dal client: clip lungo ma "leggero" in byte riceve comunque il prompt', async (t) => {
  // Frase normale di ~7s registrata in webm/opus a basso bitrate: pochi byte
  // ma NON è un clip breve. Con la durata il server deve inviare il contesto.
  const { client, calls } = makeFakeClient(() => 'Venerdì andare a cena da Michele alle 20:30');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Evento del calendario familiare: titolo, luogo, data e orario.';
  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD - 5_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
    durationMs: 7_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].prompt, 'string');
  assert.ok((calls[0].prompt as string).includes(context), 'con durata >= soglia il contesto va inviato');
  assert.equal(result.text, 'Venerdì andare a cena da Michele alle 20:30');
});

test('durata fornita dal client: clip sotto soglia di durata riceve solo hint di base anche se pesante in byte', async (t) => {
  const { client, calls } = makeFakeClient(() => 'cena');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Evento del calendario familiare.';
  await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD + 20_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
    durationMs: SHORT_CLIP_MAX_DURATION_MS - 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, BASE_HINT, 'sotto soglia di durata solo hint di base (anti-allucinazione)');
  assert.ok(!(calls[0].prompt as string).includes(context));
});

test('audio corto: se il modello echeggia l\'hint di base, il filtro anti-eco scarta il testo', async (t) => {
  const { client } = makeFakeClient(() => BASE_HINT);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const result = await transcribeAudio({
    buffer: buffersOf(1_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
  });

  // Anche per i clip brevi ora viene inviato l'hint di base: un audio vuoto
  // che ne provoca l'eco deve produrre testo vuoto, non l'hint stesso.
  assert.equal(result.text, '');
});

// ===== Plausibilità durata dichiarata vs dimensione file =====

test('isDurationPlausible: matrice di casi invalidi/incoerenti', () => {
  const cases: Array<[unknown, number, boolean, string]> = [
    [undefined, 10_000, false, 'durata assente'],
    [NaN, 10_000, false, 'durata NaN'],
    [Infinity, 10_000, false, 'durata infinita'],
    [-5_000, 10_000, false, 'durata negativa'],
    [0, 10_000, false, 'durata zero'],
    [1_000, 500_000, false, '1s dichiarato per 500KB (bitrate assurdo)'],
    [5 * 60_000, 5_000, false, '5 minuti dichiarati per 5KB'],
    [7_000, 10_000, true, '~7s per 10KB (opus basso bitrate)'],
    [2_000, 30_000, true, '2s per 30KB (m4a)'],
    [10_000, 1_760_000, true, '10s WAV stereo non compresso'],
  ];
  for (const [durationMs, bytes, expected, label] of cases) {
    assert.equal(isDurationPlausible(durationMs, bytes), expected, label);
  }
});

test('durata palesemente falsa (corta) viene ignorata: fallback in byte -> prompt inviato', async (t) => {
  // Client dichiara 1s ma invia 500KB: la durata "corta" farebbe togliere il
  // contesto. Il server deve ignorarla e, con 500KB > soglia byte, inviare il prompt.
  const { client, calls } = makeFakeClient(() => 'Cena venerdì alle 20');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Evento del calendario familiare.';
  const result = await transcribeAudio({
    buffer: buffersOf(500_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
    durationMs: 1_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].prompt, 'string');
  assert.ok((calls[0].prompt as string).includes(context), 'durata implausibile -> fallback byte -> prompt');
  assert.equal(result.text, 'Cena venerdì alle 20', 'nessun errore per l\'utente');
});

test('durata palesemente falsa (lunga) viene ignorata: fallback in byte -> solo hint di base', async (t) => {
  // Client dichiara 5 minuti ma invia 5KB: la durata "lunga" forzerebbe il
  // contesto su un clip in realtà brevissimo. Fallback byte: solo hint di base.
  const { client, calls } = makeFakeClient(() => 'cena');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const context = 'Lista della spesa della famiglia.';
  const result = await transcribeAudio({
    buffer: buffersOf(5_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context,
    durationMs: 5 * 60_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, BASE_HINT, 'durata implausibile -> fallback byte -> solo hint di base');
  assert.ok(!(calls[0].prompt as string).includes(context));
  assert.equal(result.text, 'cena');
});

test('durata negativa/invalida: fallback in byte senza errori', async (t) => {
  const { client, calls } = makeFakeClient(() => 'ok');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_MAX_BYTES + 10_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context: 'Contesto.',
    durationMs: -1_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].prompt, 'string', 'sopra soglia byte il prompt va inviato');
  assert.equal(result.text, 'ok');
});

test('i limiti di plausibilità coprono i codec reali senza accettare gli estremi', () => {
  // Opus a basso bitrate (~1 KB/s) e WAV stereo (~176 KB/s) devono passare.
  assert.ok(PLAUSIBLE_MIN_BYTES_PER_SEC <= 1_000);
  assert.ok(PLAUSIBLE_MAX_BYTES_PER_SEC >= 176_400);
  // Gli estremi assurdi restano fuori.
  assert.ok(500_000 > PLAUSIBLE_MAX_BYTES_PER_SEC);
  assert.ok(5_000 / 300 < PLAUSIBLE_MIN_BYTES_PER_SEC);
});
