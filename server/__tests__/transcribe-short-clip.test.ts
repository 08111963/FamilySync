import test from 'node:test';
import assert from 'node:assert/strict';
import type OpenAI from 'openai';
import { transcribeAudio, __setOpenAiClientForTests } from '../lib/openai';

// La chiave serve solo a superare assertAiConfigured: il client è mockato,
// nessuna chiamata reale a OpenAI.
const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-key-not-real';

// Soglia in transcribeAudio: sotto 15KB niente prompt (audio troppo breve).
const SHORT_BUFFER = Buffer.alloc(1_000, 1);
const LONG_BUFFER = Buffer.alloc(30_000, 1);
const CONTEXT = 'Evento del calendario familiare: titolo, luogo, data e orario.';

type CreateArgs = Record<string, unknown>;

function mockClient(responseText: string, captured: CreateArgs[]): OpenAI {
  return {
    audio: {
      transcriptions: {
        create: async (args: CreateArgs) => {
          captured.push(args);
          return { text: responseText };
        },
      },
    },
  } as unknown as OpenAI;
}

test.after(() => {
  __setOpenAiClientForTests(null);
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

test('audio breve: la richiesta NON include alcun prompt (anti-allucinazione)', async () => {
  const captured: CreateArgs[] = [];
  __setOpenAiClientForTests(mockClient('cena', captured));

  const result = await transcribeAudio({
    buffer: SHORT_BUFFER,
    filename: 'voice.webm',
    mimeType: 'audio/webm',
    context: CONTEXT,
  });

  assert.equal(captured.length, 1);
  assert.equal('prompt' in captured[0], false, 'il prompt non deve essere inviato per audio brevi');
  assert.equal(result.text, 'cena');
});

test('audio lungo: la richiesta include il prompt con il contesto', async () => {
  const captured: CreateArgs[] = [];
  __setOpenAiClientForTests(mockClient('Cena con Marco venerdì alle 20', captured));

  const result = await transcribeAudio({
    buffer: LONG_BUFFER,
    filename: 'voice.webm',
    mimeType: 'audio/webm',
    context: CONTEXT,
  });

  assert.equal(captured.length, 1);
  const prompt = captured[0].prompt;
  assert.equal(typeof prompt, 'string', 'il prompt deve essere inviato per audio lunghi');
  assert.ok((prompt as string).includes(CONTEXT), 'il prompt deve contenere il contesto');
  assert.ok(!(prompt as string).includes('venerdì alle 20"'), 'il prompt non deve contenere frasi d\'esempio');
  assert.equal(result.text, 'Cena con Marco venerdì alle 20');
});

test('audio lungo senza contesto: prompt = solo hint di base', async () => {
  const captured: CreateArgs[] = [];
  __setOpenAiClientForTests(mockClient('ciao', captured));

  await transcribeAudio({
    buffer: LONG_BUFFER,
    filename: 'voice.webm',
    mimeType: 'audio/webm',
  });

  const prompt = captured[0].prompt as string;
  assert.equal(typeof prompt, 'string');
  assert.ok(!prompt.includes(CONTEXT));
});

test('anti-eco: se il modello restituisce il prompt inviato, il testo è vuoto', async () => {
  const captured: CreateArgs[] = [];
  // Primo giro: cattura il prompt reale inviato per un audio lungo.
  __setOpenAiClientForTests(mockClient('x', captured));
  await transcribeAudio({ buffer: LONG_BUFFER, filename: 'voice.webm', mimeType: 'audio/webm', context: CONTEXT });
  const sentPrompt = captured[0].prompt as string;

  // Secondo giro: il modello "echeggia" quel prompt → deve essere scartato.
  __setOpenAiClientForTests(mockClient(sentPrompt, []));
  const result = await transcribeAudio({
    buffer: LONG_BUFFER,
    filename: 'voice.webm',
    mimeType: 'audio/webm',
    context: CONTEXT,
  });
  assert.equal(result.text, '');
});

test('audio breve: un eventuale eco del vecchio prompt NON viene filtrato (nessun prompt inviato)', async () => {
  // Con audio breve non c'è prompt: qualunque testo torna così com'è.
  __setOpenAiClientForTests(mockClient('spesa', []));
  const result = await transcribeAudio({
    buffer: SHORT_BUFFER,
    filename: 'voice.webm',
    mimeType: 'audio/webm',
  });
  assert.equal(result.text, 'spesa');
});
