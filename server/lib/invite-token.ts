import { randomBytes, createHash } from 'crypto';

/**
 * Genera un token di invito sicuro (256 bit di entropia) da inserire nel link
 * inviato via email. Il token in chiaro NON viene mai salvato nel database:
 * viene salvato solo il suo hash (vedi {@link hashInviteToken}).
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calcola l'hash SHA-256 di un token di invito. Usato sia per salvare l'invito
 * sia per ritrovarlo in fase di accettazione, così il token in chiaro resta
 * solo nel link/email e mai nel DB.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
