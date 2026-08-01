import test from 'node:test';
import assert from 'node:assert/strict';

// Chiave finta: serve solo a superare assertAiConfigured(); il client OpenAI
// vero non viene mai creato perché lo iniettiamo noi con il mock.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-real';

import { parseEventFromText, __setOpenAiClientForTest } from '../lib/openai';

type ChatArgs = { messages: Array<{ role: string; content: string }>; [k: string]: unknown };

function makeFakeChatClient(respond: (args: ChatArgs) => string) {
  const calls: ChatArgs[] = [];
  const client = {
    chat: {
      completions: {
        create: async (args: ChatArgs) => {
          calls.push(args);
          return { choices: [{ message: { content: respond(args) } }] };
        },
      },
    },
  };
  return { client, calls };
}

test('parse-event: giorno relativo e luogo informale finiscono nei campi giusti', async (t) => {
  const { client, calls } = makeFakeChatClient(() => JSON.stringify({
    title: 'Cena da Michele',
    location: 'Michele',
    description: null,
    date: '2026-08-07',
    time: '20:30',
    endTime: null,
    repeat: null,
    weekdays: [],
    monthDays: [],
    assigneeName: null,
  }));
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const parsed = await parseEventFromText({
    text: 'venerdì andare a cena da Michele alle ore 20:30',
    todayIso: '2026-08-01',
    weekdayName: 'sabato',
  });

  assert.equal(parsed.date, '2026-08-07');
  assert.equal(parsed.time, '20:30');
  assert.equal(parsed.location, 'Michele');

  // Il prompt di sistema deve ancorare le date relative a oggi e istruire
  // esplicitamente su luogo ("da Luigi") e risoluzione dei giorni relativi.
  const sys = calls[0].messages[0].content;
  assert.ok(sys.includes('2026-08-01'), 'il prompt deve contenere la data odierna');
  assert.ok(sys.includes('sabato'), 'il prompt deve contenere il giorno della settimana odierno');
  assert.ok(/venerd/i.test(sys) || /date relative/i.test(sys), 'il prompt deve istruire sulle date relative');
  assert.ok(sys.includes('da Luigi'), 'il prompt deve istruire sui luoghi informali (es. "da Luigi")');
});

test('parse-event: risposta senza alcun campo utile -> errore AI_BAD_RESPONSE', async (t) => {
  const { client } = makeFakeChatClient(() => '{}');
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    () => parseEventFromText({ text: 'bla', todayIso: '2026-08-01', weekdayName: 'sabato' }),
    (err: any) => err?.code === 'AI_BAD_RESPONSE' || String(err).includes('AI_BAD_RESPONSE'),
  );
});
