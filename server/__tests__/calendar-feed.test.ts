import test from 'node:test';
import assert from 'node:assert/strict';
import {
  icsEscape,
  plusOneHour,
  nextDayIso,
  computeTimedEnd,
} from '../routes/calendar-feed';

test('icsEscape: caratteri speciali RFC 5545', () => {
  assert.equal(icsEscape('Cena; pizza, birra'), 'Cena\\; pizza\\, birra');
  assert.equal(icsEscape('back\\slash'), 'back\\\\slash');
  assert.equal(icsEscape('riga1\nriga2'), 'riga1\\nriga2');
});

test('plusOneHour: caso normale e wrap oltre mezzanotte', () => {
  assert.equal(plusOneHour('09:30'), '10:30');
  assert.equal(plusOneHour('23:30'), '00:30');
  assert.equal(plusOneHour('23:00'), '00:00');
});

test('nextDayIso: incremento giorno, fine mese e fine anno', () => {
  assert.equal(nextDayIso('2026-07-05'), '2026-07-06');
  assert.equal(nextDayIso('2026-07-31'), '2026-08-01');
  assert.equal(nextDayIso('2026-12-31'), '2027-01-01');
  assert.equal(nextDayIso('2028-02-28'), '2028-02-29');
});

test('computeTimedEnd: endTime esplicito dopo inizio resta lo stesso giorno', () => {
  assert.deepEqual(computeTimedEnd('2026-07-05', '09:30', '10:15'), {
    endDate: '2026-07-05',
    endTime: '10:15',
  });
});

test('computeTimedEnd: endTime esplicito prima dell inizio va al giorno dopo', () => {
  assert.deepEqual(computeTimedEnd('2026-07-05', '22:00', '01:00'), {
    endDate: '2026-07-06',
    endTime: '01:00',
  });
});

test('computeTimedEnd: senza endTime usa +1h stesso giorno', () => {
  assert.deepEqual(computeTimedEnd('2026-07-05', '09:30', null), {
    endDate: '2026-07-05',
    endTime: '10:30',
  });
});

test('computeTimedEnd: senza endTime con wrap notturno va al giorno dopo (bug fix)', () => {
  assert.deepEqual(computeTimedEnd('2026-07-05', '23:30', null), {
    endDate: '2026-07-06',
    endTime: '00:30',
  });
  assert.deepEqual(computeTimedEnd('2026-07-05', '23:00', undefined), {
    endDate: '2026-07-06',
    endTime: '00:00',
  });
});

test('computeTimedEnd: endTime uguale all inizio va al giorno dopo', () => {
  assert.deepEqual(computeTimedEnd('2026-07-05', '10:00', '10:00'), {
    endDate: '2026-07-06',
    endTime: '10:00',
  });
});
