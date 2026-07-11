import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeDueEventPushes } from '../lib/event-push';

const TZ = 'Europe/Rome';
const WINDOW = 30 * 60 * 1000;

function makeEvent(overrides: Partial<Parameters<typeof computeDueEventPushes>[0]> = {}) {
  return {
    id: 'e1',
    title: 'Cena famiglia',
    date: '2026-07-20',
    time: '19:30' as string | null,
    allDay: false as boolean | null,
    location: null as string | null,
    ...overrides,
  };
}

test('evento con orario: promemoria 30 minuti prima', () => {
  // 20 luglio 2026 19:30 Roma = 17:30 UTC → promemoria 17:00 UTC
  const now = new Date('2026-07-20T17:00:30.000Z');
  const due = computeDueEventPushes(makeEvent(), now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'start-30m:2026-07-20T19:30');
  assert.equal(due[0].title, 'Evento tra 30 minuti');
  assert.ok(due[0].body.includes('Cena famiglia'));
  assert.ok(due[0].body.includes('alle 19:30'));
});

test('luogo incluso nel testo se presente', () => {
  const now = new Date('2026-07-20T17:00:00.000Z');
  const due = computeDueEventPushes(makeEvent({ location: 'Da nonna' }), now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.ok(due[0].body.includes('· Da nonna'));
});

test('niente invio prima dell orario del promemoria', () => {
  const now = new Date('2026-07-20T16:59:00.000Z');
  const due = computeDueEventPushes(makeEvent(), now, TZ, WINDOW);
  assert.equal(due.length, 0);
});

test('niente invio oltre la finestra di recupero', () => {
  const now = new Date('2026-07-20T17:31:00.000Z');
  const due = computeDueEventPushes(makeEvent(), now, TZ, WINDOW);
  assert.equal(due.length, 0);
});

test('evento senza orario: promemoria alle 08:00 del giorno', () => {
  // 08:00 Roma (estate) = 06:00 UTC
  const now = new Date('2026-07-20T06:00:10.000Z');
  const due = computeDueEventPushes(makeEvent({ time: null }), now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'allday:2026-07-20');
  assert.equal(due[0].title, 'Evento di oggi');
  assert.ok(due[0].body.includes('oggi'));
});

test('evento tutto il giorno: alle 08:00 anche se ha un orario', () => {
  const now = new Date('2026-07-20T06:00:00.000Z');
  const due = computeDueEventPushes(makeEvent({ allDay: true }), now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'allday:2026-07-20');
});

test('inverno: 08:00 Roma = 07:00 UTC', () => {
  const now = new Date('2026-01-15T07:00:00.000Z');
  const due = computeDueEventPushes(
    makeEvent({ date: '2026-01-15', time: null }),
    now,
    TZ,
    WINDOW
  );
  assert.equal(due.length, 1);
});

test('la chiave cambia se cambiano data o orario (ri-invio dopo modifica)', () => {
  const now1 = new Date('2026-07-20T17:00:00.000Z');
  const key1 = computeDueEventPushes(makeEvent(), now1, TZ, WINDOW)[0].reminderKey;
  const now2 = new Date('2026-07-20T18:00:00.000Z');
  const key2 = computeDueEventPushes(makeEvent({ time: '20:30' }), now2, TZ, WINDOW)[0]
    .reminderKey;
  assert.notEqual(key1, key2);
});

test('data non valida: nessun promemoria', () => {
  const due = computeDueEventPushes(makeEvent({ date: 'boh' }), new Date(), TZ, WINDOW);
  assert.equal(due.length, 0);
});

test('orario non valido: trattato come senza orario', () => {
  const now = new Date('2026-07-20T06:00:00.000Z');
  const due = computeDueEventPushes(makeEvent({ time: '25:99' }), now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'allday:2026-07-20');
});
