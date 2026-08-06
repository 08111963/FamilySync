import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateChildAccessCode,
  normalizeChildAccessCode,
  hashChildAccessCode,
  formatChildAccessCode,
  childSyntheticEmail,
  isChildSyntheticEmail,
} from '../lib/child-access';

test('genera codici di 8 caratteri da alfabeto non ambiguo', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateChildAccessCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[ACDEFGHJKMNPQRTUVWXYZ234679]{8}$/);
  }
});

test('normalizzazione: maiuscole, senza spazi/trattini', () => {
  assert.equal(normalizeChildAccessCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(normalizeChildAccessCode('AB CD ef-gh'), 'ABCDEFGH');
});

test("l'hash è invariante rispetto alla formattazione dell'input", () => {
  const code = generateChildAccessCode();
  assert.equal(hashChildAccessCode(code), hashChildAccessCode(formatChildAccessCode(code)));
  assert.equal(hashChildAccessCode(code), hashChildAccessCode(code.toLowerCase()));
  // e NON è il codice in chiaro
  assert.notEqual(hashChildAccessCode(code), code);
  assert.match(hashChildAccessCode(code), /^[0-9a-f]{64}$/);
});

test('formattazione leggibile ABCD-EFGH', () => {
  assert.equal(formatChildAccessCode('ABCDEFGH'), 'ABCD-EFGH');
});

test('email sintetica bambino riconosciuta e non recapitabile', () => {
  const email = childSyntheticEmail('123e4567-e89b-12d3-a456-426614174000');
  assert.ok(isChildSyntheticEmail(email));
  assert.ok(email.endsWith('@child.familysync.invalid'));
  assert.ok(!isChildSyntheticEmail('luca@example.com'));
  assert.ok(!isChildSyntheticEmail('noreply@familysync.eu'));
});
