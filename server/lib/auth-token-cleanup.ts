import { lt } from 'drizzle-orm';
import { db } from '../db';
import { emailVerificationTokens, passwordResetTokens, socialSignupTokens } from '../../shared/schema';
import { logger } from './logger';

// Pulizia "al volo" dei token scaduti: viene invocata (fire-and-forget) quando
// si richiede un nuovo token, così le tabelle non crescono all'infinito senza
// bisogno di un cron dedicato. Throttle in-memory per non fare 3 DELETE a ogni
// registrazione: al massimo una passata per intervallo per istanza.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 ora
let lastCleanupAt = 0;

/**
 * Elimina i token scaduti (expires_at nel passato) da:
 * - email_verification_tokens
 * - password_reset_tokens
 * - social_signup_tokens
 * I token ancora validi non vengono MAI toccati (condizione strict `<ceil now`).
 * Ritorna il numero di righe eliminate per tabella.
 */
export async function cleanupExpiredAuthTokens(now: Date = new Date()) {
  const [verification, reset, social] = await Promise.all([
    db.delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, now))
      .returning({ id: emailVerificationTokens.id }),
    db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, now))
      .returning({ id: passwordResetTokens.id }),
    db.delete(socialSignupTokens)
      .where(lt(socialSignupTokens.expiresAt, now))
      .returning({ id: socialSignupTokens.id }),
  ]);

  const deleted = {
    emailVerification: verification.length,
    passwordReset: reset.length,
    socialSignup: social.length,
  };

  if (deleted.emailVerification || deleted.passwordReset || deleted.socialSignup) {
    logger.info('Expired auth tokens cleaned up', deleted);
  }

  return deleted;
}

/**
 * Variante throttled e fire-and-forget da usare nei percorsi caldi (signup,
 * resend verifica, forgot password): non blocca la risposta e non fa più di
 * una passata per ora per istanza. Gli errori vengono solo loggati: la pulizia
 * non deve mai far fallire la richiesta dell'utente.
 */
export function scheduleAuthTokenCleanup(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  cleanupExpiredAuthTokens().catch((error) => {
    logger.error('Expired auth token cleanup failed', { error: String(error) });
  });
}

/** Solo per i test: resetta il throttle in-memory. */
export function __resetAuthTokenCleanupThrottleForTests(): void {
  lastCleanupAt = 0;
}
