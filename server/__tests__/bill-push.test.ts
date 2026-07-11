import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zonedTimeToUtc, computeDueBillPushes } from '../lib/bill-push';

// ---------------------------------------------------------------------------
// zonedTimeToUtc — conversione "orario da parete" (Europe/Rome) → istante UTC
// ---------------------------------------------------------------------------

test('zonedTimeToUtc: inverno (CET, UTC+1)', () => {
  // 15 gennaio 2026, 08:00 a Roma = 07:00 UTC
  const d = zonedTimeToUtc(2026, 1, 15, 8, 0, 'Europe/Rome');
  assert.equal(d.toISOString(), '2026-01-15T07:00:00.000Z');
});

test('zonedTimeToUtc: estate (CEST, UTC+2)', () => {
  // 15 luglio 2026, 08:00 a Roma = 06:00 UTC
  const d = zonedTimeToUtc(2026, 7, 15, 8, 0, 'Europe/Rome');
  assert.equal(d.toISOString(), '2026-07-15T06:00:00.000Z');
});

test('zonedTimeToUtc: giorno del passaggio a ora legale', () => {
  // 29 marzo 2026: le 08:00 a Roma sono già CEST (UTC+2) → 06:00 UTC
  const d = zonedTimeToUtc(2026, 3, 29, 8, 0, 'Europe/Rome');
  assert.equal(d.toISOString(), '2026-03-29T06:00:00.000Z');
});

test('zonedTimeToUtc: minuti preservati', () => {
  const d = zonedTimeToUtc(2026, 7, 20, 15, 45, 'Europe/Rome');
  assert.equal(d.toISOString(), '2026-07-20T13:45:00.000Z');
});

// ---------------------------------------------------------------------------
// computeDueBillPushes — quali promemoria devono partire ADESSO
// ---------------------------------------------------------------------------

function makeBill(overrides: Partial<Parameters<typeof computeDueBillPushes>[0]> = {}) {
  return {
    id: 'b1',
    title: 'Luce',
    amount: '55.50',
    dueDate: '2026-07-20',
    status: 'da_pagare',
    remindersEnabled: true,
    customReminderDates: [] as unknown,
    ...overrides,
  };
}

const TZ = 'Europe/Rome';
const WINDOW = 30 * 60 * 1000;

test('offset 0: parte alle 08:00 del giorno di scadenza', () => {
  // 20 luglio 2026 08:00 Roma = 06:00 UTC
  const now = new Date('2026-07-20T06:00:30.000Z');
  const due = computeDueBillPushes(makeBill(), 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, '0:2026-07-20');
  assert.equal(due[0].title, 'Bolletta in scadenza oggi');
  assert.ok(due[0].body.includes('Luce'));
  assert.ok(due[0].body.includes('€ 55,50'));
  assert.ok(due[0].body.includes('scade il 20/07/2026'));
});

test('offset 1 (free): parte il giorno prima alle 08:00', () => {
  const now = new Date('2026-07-19T06:05:00.000Z');
  const due = computeDueBillPushes(makeBill(), 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, '1:2026-07-20');
  assert.equal(due[0].title, 'Bolletta in scadenza domani');
});

test('premium: offset 7 e 3 attivi', () => {
  const now7 = new Date('2026-07-13T06:00:00.000Z');
  const due7 = computeDueBillPushes(makeBill(), 'premium', now7, TZ, WINDOW);
  assert.equal(due7.length, 1);
  assert.equal(due7[0].reminderKey, '7:2026-07-20');

  // Il piano free NON riceve l'offset 7
  const dueFree = computeDueBillPushes(makeBill(), 'free', now7, TZ, WINDOW);
  assert.equal(dueFree.length, 0);
});

test('niente invio prima dell orario previsto', () => {
  const now = new Date('2026-07-20T05:59:00.000Z'); // 07:59 a Roma
  const due = computeDueBillPushes(makeBill(), 'free', now, TZ, WINDOW);
  assert.equal(due.length, 0);
});

test('niente invio oltre la finestra di recupero', () => {
  const now = new Date('2026-07-20T06:31:00.000Z'); // 31 min dopo
  const due = computeDueBillPushes(makeBill(), 'free', now, TZ, WINDOW);
  assert.equal(due.length, 0);
});

test('dentro la finestra di recupero: invia', () => {
  const now = new Date('2026-07-20T06:29:00.000Z'); // 29 min dopo
  const due = computeDueBillPushes(makeBill(), 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
});

test('bolletta pagata o promemoria disattivati: mai', () => {
  const now = new Date('2026-07-20T06:00:00.000Z');
  assert.equal(computeDueBillPushes(makeBill({ status: 'pagata' }), 'free', now, TZ, WINDOW).length, 0);
  assert.equal(computeDueBillPushes(makeBill({ remindersEnabled: false }), 'free', now, TZ, WINDOW).length, 0);
});

test('promemoria personalizzato con ora esatta', () => {
  // 18 luglio 2026 15:30 Roma = 13:30 UTC
  const bill = makeBill({ customReminderDates: ['2026-07-18T15:30'] });
  const now = new Date('2026-07-18T13:30:20.000Z');
  const due = computeDueBillPushes(bill, 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'custom:2026-07-18T15:30');
  assert.equal(due[0].title, 'Promemoria bolletta');
});

test('promemoria personalizzato solo-data: alle 08:00', () => {
  const bill = makeBill({ customReminderDates: ['2026-07-18'] });
  const now = new Date('2026-07-18T06:00:00.000Z'); // 08:00 Roma
  const due = computeDueBillPushes(bill, 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, 'custom:2026-07-18');
});

test('personalizzato identico a un offset automatico: niente doppione', () => {
  // Personalizzato alle 08:00 del giorno di scadenza = offset 0
  const bill = makeBill({ customReminderDates: ['2026-07-20T08:00'] });
  const now = new Date('2026-07-20T06:00:00.000Z');
  const due = computeDueBillPushes(bill, 'free', now, TZ, WINDOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].reminderKey, '0:2026-07-20');
});

test('data non valida: nessun promemoria', () => {
  const due = computeDueBillPushes(
    makeBill({ dueDate: 'non-valida' }),
    'free',
    new Date(),
    TZ,
    WINDOW
  );
  assert.equal(due.length, 0);
});
