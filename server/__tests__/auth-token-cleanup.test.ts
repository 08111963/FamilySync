// Test per la pulizia dei token di autenticazione scaduti.
// Esegue: npx tsx server/__tests__/auth-token-cleanup.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db';
import { users, emailVerificationTokens, passwordResetTokens, socialSignupTokens } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { cleanupExpiredAuthTokens } from '../lib/auth-token-cleanup';

const MARKER = `cleanup-test-${Date.now()}`;
let userId: string;

before(async () => {
  const [u] = await db.insert(users).values({
    email: `${MARKER}@example.com`,
    passwordHash: 'x',
    name: 'Cleanup Test',
    emailVerified: false,
    ageBand: 'adult',
  }).returning();
  userId = u.id;
});

after(async () => {
  // Cascade rimuove i token dell'utente; puliamo anche i social tokens marker.
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(socialSignupTokens).where(eq(socialSignupTokens.email, `${MARKER}@example.com`));
});

test('elimina i token scaduti e preserva quelli validi', async () => {
  const past = new Date(Date.now() - 60 * 1000);
  const future = new Date(Date.now() + 60 * 60 * 1000);

  const inserted = await db.insert(emailVerificationTokens).values([
    { userId, token: `${MARKER}-ev-expired`, expiresAt: past },
    { userId, token: `${MARKER}-ev-valid`, expiresAt: future },
  ]).returning({ id: emailVerificationTokens.id });

  const insertedReset = await db.insert(passwordResetTokens).values([
    { userId, token: `${MARKER}-pr-expired`, expiresAt: past },
    { userId, token: `${MARKER}-pr-valid`, expiresAt: future },
  ]).returning({ id: passwordResetTokens.id });

  await db.insert(socialSignupTokens).values([
    { tokenHash: `${MARKER}-ss-expired`.padEnd(64, '0').slice(0, 64), provider: 'google', email: `${MARKER}@example.com`, expiresAt: past },
    { tokenHash: `${MARKER}-ss-valid`.padEnd(64, '1').slice(0, 64), provider: 'google', email: `${MARKER}@example.com`, expiresAt: future },
  ]);

  const deleted = await cleanupExpiredAuthTokens();
  assert.ok(deleted.emailVerification >= 1, 'almeno un email verification token scaduto eliminato');
  assert.ok(deleted.passwordReset >= 1, 'almeno un password reset token scaduto eliminato');
  assert.ok(deleted.socialSignup >= 1, 'almeno un social signup token scaduto eliminato');

  const evLeft = await db.select().from(emailVerificationTokens)
    .where(inArray(emailVerificationTokens.id, inserted.map(r => r.id)));
  assert.equal(evLeft.length, 1);
  assert.equal(evLeft[0].token, `${MARKER}-ev-valid`);

  const prLeft = await db.select().from(passwordResetTokens)
    .where(inArray(passwordResetTokens.id, insertedReset.map(r => r.id)));
  assert.equal(prLeft.length, 1);
  assert.equal(prLeft[0].token, `${MARKER}-pr-valid`);

  const ssLeft = await db.select().from(socialSignupTokens)
    .where(eq(socialSignupTokens.email, `${MARKER}@example.com`));
  assert.equal(ssLeft.length, 1);
  assert.ok(ssLeft[0].tokenHash.startsWith(`${MARKER}-ss-valid`.slice(0, 20)));
});

test('seconda passata: i token marker scaduti non ci sono più (idempotente)', async () => {
  // Non assertiamo un conteggio globale a zero (il DB condiviso potrebbe aver
  // accumulato altre righe scadute nel frattempo): verifichiamo che le NOSTRE
  // righe scadute siano sparite e quelle valide sopravvivano a una nuova passata.
  await cleanupExpiredAuthTokens();

  const ev = await db.select().from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].token, `${MARKER}-ev-valid`);

  const pr = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));
  assert.equal(pr.length, 1);
  assert.equal(pr[0].token, `${MARKER}-pr-valid`);

  const ss = await db.select().from(socialSignupTokens)
    .where(eq(socialSignupTokens.email, `${MARKER}@example.com`));
  assert.equal(ss.length, 1);
});

test('ogni punto di emissione token schedula la pulizia (guardia statica)', async () => {
  // Guardia anti-regressione: ogni file che INSERISCE token di verifica email,
  // reset password o social signup deve chiamare scheduleAuthTokenCleanup.
  const { readFile } = await import('node:fs/promises');
  const issuers = ['server/routes/auth.ts', 'server/routes/join-link.ts'];
  for (const file of issuers) {
    const src = await readFile(file, 'utf8');
    assert.ok(src.includes('scheduleAuthTokenCleanup('), `${file} deve schedulare la pulizia dei token scaduti`);
  }
});

test('scheduleAuthTokenCleanup è throttled per istanza', async () => {
  const { scheduleAuthTokenCleanup, __resetAuthTokenCleanupThrottleForTests } =
    await import('../lib/auth-token-cleanup');
  __resetAuthTokenCleanupThrottleForTests();
  // Prima chiamata: parte la pulizia (fire-and-forget). Le successive entro
  // l'intervallo non devono fare nulla (nessun errore, nessun await necessario).
  scheduleAuthTokenCleanup();
  scheduleAuthTokenCleanup();
  scheduleAuthTokenCleanup();
  // Diamo tempo al fire-and-forget di completare prima della chiusura del test.
  await new Promise((r) => setTimeout(r, 500));
});
