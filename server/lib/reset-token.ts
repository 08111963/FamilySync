import { randomBytes, createHash } from 'crypto';

/**
 * Genera un token sicuro per il reset password (256 bit di entropia) da inserire
 * nel link inviato via email. Il token in chiaro NON viene mai salvato nel
 * database: viene salvato solo il suo hash (vedi {@link hashResetToken}).
 */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calcola l'hash SHA-256 di un token di reset. Usato sia per salvare la richiesta
 * sia per ritrovarla in fase di reset, così il token in chiaro resta solo nel
 * link/email e mai nel DB.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
