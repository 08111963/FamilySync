import test from 'node:test';
import assert from 'node:assert/strict';

// Chiave finta: serve solo a superare assertAiConfigured(); il client OpenAI
// vero non viene mai creato perché lo iniettiamo noi con il mock.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-real';

import { transcribeAudio, __setOpenAiClientForTest } from '../lib/openai';

import { SHORT_CLIP_MAX_BYTES, SHORT_CLIP_MAX_DURATION_MS } from '../lib/openai';

// Soglia in byte sotto la quale l'audio viene trascritto SENZA prompt di
// contesto quando il client non fornisce la durata.
const SHORT_CLIP_THRESHOLD = SHORT_CLIP_MAX_BYTES;

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

test('audio corto sotto soglia: la chiamata a OpenAI NON include prompt', async (t) => {
  const { client, calls } = makeFakeClient(() => 'cena');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const result = await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD - 1),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context: 'Evento del calendario familiare: titolo, luogo, data e orario.',
  });

  assert.equal(calls.length, 1);
  assert.equal('prompt' in calls[0], false, 'il prompt NON deve essere inviato per clip brevi');
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

test('durata fornita dal client: clip sotto soglia di durata NON riceve prompt anche se pesante in byte', async (t) => {
  const { client, calls } = makeFakeClient(() => 'cena');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await transcribeAudio({
    buffer: buffersOf(SHORT_CLIP_THRESHOLD + 20_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
    context: 'Evento del calendario familiare.',
    durationMs: SHORT_CLIP_MAX_DURATION_MS - 1,
  });

  assert.equal(calls.length, 1);
  assert.equal('prompt' in calls[0], false, 'sotto soglia di durata niente prompt (anti-allucinazione)');
});

test('audio corto: anche se il modello risponde con testo lungo, nessun filtro anti-eco scatta (nessun prompt inviato)', async (t) => {
  const echoLike =
    'Dettatura vocale in italiano per un\'app di famiglia. Trascrivi fedelmente solo le parole pronunciate.';
  const { client } = makeFakeClient(() => echoLike);
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const result = await transcribeAudio({
    buffer: buffersOf(1_000),
    filename: 'clip.webm',
    mimeType: 'audio/webm',
  });

  // Senza prompt inviato non esiste eco da filtrare: il testo passa com'è.
  assert.equal(result.text, echoLike);
});
