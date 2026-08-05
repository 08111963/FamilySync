/**
 * Regressione (bug reale in produzione, 5 ago 2026): due promemoria eventi
 * inviati a pochi secondi di distanza condividevano lo stesso tag nel service
 * worker web push, quindi la seconda notifica SOSTITUIVA la prima e l'utente
 * ne vedeva una sola. Il tag deve includere l'id dell'elemento.
 *
 * Esecuzione: npx tsx server/__tests__/web-push-tag.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(__dirname, '../..');
const SW_PATH = path.join(ROOT, 'public/sw.js');

type TagFn = (data: unknown) => string | undefined;

/** Carica public/sw.js in una sandbox con un finto `self` da service worker. */
function loadServiceWorker(): { computeTag: TagFn; shown: Array<{ title: string; options: any }>; pushListener: (event: any) => void } {
  const shown: Array<{ title: string; options: any }> = [];
  const listeners: Record<string, (event: any) => void> = {};
  const self: any = {
    addEventListener: (name: string, fn: (event: any) => void) => { listeners[name] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    registration: {
      showNotification: (title: string, options: any) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
  };
  vm.runInNewContext(readFileSync(SW_PATH, 'utf8'), { self });
  assert.equal(typeof self.__computeNotificationTag, 'function',
    'public/sw.js deve esporre self.__computeNotificationTag per i test');
  assert.equal(typeof listeners.push, 'function', 'listener push mancante');
  return { computeTag: self.__computeNotificationTag, shown, pushListener: listeners.push };
}

test('due event_reminder con eventId DIVERSI producono tag diversi', () => {
  const { computeTag } = loadServiceWorker();
  const tagA = computeTag({ type: 'event_reminder', eventId: 'ev-1' });
  const tagB = computeTag({ type: 'event_reminder', eventId: 'ev-2' });
  assert.ok(tagA && tagB);
  assert.notEqual(tagA, tagB,
    'tag uguali: la seconda notifica sostituirebbe la prima (bug del 5 ago 2026)');
});

test('stesso eventId produce lo stesso tag (aggiornamento voluto)', () => {
  const { computeTag } = loadServiceWorker();
  assert.equal(
    computeTag({ type: 'event_reminder', eventId: 'ev-1' }),
    computeTag({ type: 'event_reminder', eventId: 'ev-1' }),
  );
});

test('billId e choreId distinguono i tag; senza type nessun tag', () => {
  const { computeTag } = loadServiceWorker();
  assert.notEqual(
    computeTag({ type: 'bill_reminder', billId: 'b-1' }),
    computeTag({ type: 'bill_reminder', billId: 'b-2' }),
  );
  assert.notEqual(
    computeTag({ type: 'chore_reminder', choreId: 'c-1' }),
    computeTag({ type: 'chore_reminder', choreId: 'c-2' }),
  );
  // Tipi diversi non collidono mai, anche a parità di id.
  assert.notEqual(
    computeTag({ type: 'event_reminder', eventId: 'x' }),
    computeTag({ type: 'bill_reminder', billId: 'x' }),
  );
  assert.equal(computeTag({}), undefined);
  assert.equal(computeTag(undefined), undefined);
});

test('end-to-end nel listener push: due notifiche ravvicinate restano entrambe visibili', async () => {
  const { shown, pushListener } = loadServiceWorker();
  const makeEvent = (payload: any) => ({
    data: { json: () => payload, text: () => JSON.stringify(payload) },
    waitUntil: (p: Promise<unknown>) => p,
  });
  await pushListener(makeEvent({
    title: 'Evento oggi', body: 'A', data: { type: 'event_reminder', eventId: 'ev-1' },
  }));
  await pushListener(makeEvent({
    title: 'Evento oggi', body: 'B', data: { type: 'event_reminder', eventId: 'ev-2' },
  }));
  assert.equal(shown.length, 2);
  assert.ok(shown[0].options.tag && shown[1].options.tag);
  assert.notEqual(shown[0].options.tag, shown[1].options.tag,
    'stesso tag: il browser mostrerebbe una sola notifica');
});

test('patch-web-build.sh riallinea web-build/sw.js alla fonte in public/', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'webbuild-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), '<html lang="en"><head></head><body></body></html>');
    writeFileSync(path.join(dir, 'sw.js'), '/* versione stantia senza tag per-elemento */');
    execFileSync('bash', ['scripts/patch-web-build.sh', dir], { cwd: ROOT });
    const patched = readFileSync(path.join(dir, 'sw.js'), 'utf8');
    assert.equal(patched, readFileSync(SW_PATH, 'utf8'),
      'web-build/sw.js deve essere identico a public/sw.js dopo il build');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
