import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEventTimeFields } from '../lib/normalize-event-times';

test('orario recuperabile viene normalizzato a HH:MM', () => {
  assert.deepEqual(normalizeEventTimeFields({ time: '15', endTime: '16' }), {
    time: '15:00',
    endTime: '16:00',
    changed: true,
    clearedStart: false,
    clearedEnd: false,
  });
  assert.deepEqual(normalizeEventTimeFields({ time: '9:30', endTime: '15.45' }), {
    time: '09:30',
    endTime: '15:45',
    changed: true,
    clearedStart: false,
    clearedEnd: false,
  });
});

test('orario già canonico non viene toccato (idempotenza)', () => {
  const r = normalizeEventTimeFields({ time: '09:30', endTime: '10:15' });
  assert.equal(r.changed, false);
  assert.equal(r.time, '09:30');
  assert.equal(r.endTime, '10:15');
});

test('inizio irrecuperabile: time azzerato e end_time azzerato di conseguenza', () => {
  assert.deepEqual(normalizeEventTimeFields({ time: 'boh', endTime: '10:00' }), {
    time: null,
    endTime: null,
    changed: true,
    clearedStart: true,
    clearedEnd: false,
  });
});

test('fine irrecuperabile: solo end_time azzerato, inizio conservato', () => {
  assert.deepEqual(normalizeEventTimeFields({ time: '15', endTime: '99:99' }), {
    time: '15:00',
    endTime: null,
    changed: true,
    clearedStart: false,
    clearedEnd: true,
  });
});

test('evento senza orari resta invariato', () => {
  const r = normalizeEventTimeFields({ time: null, endTime: null });
  assert.equal(r.changed, false);
  assert.equal(r.time, null);
  assert.equal(r.endTime, null);
});
