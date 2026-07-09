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

/**
 * Genera un codice di invito RIUTILIZZABILE per la famiglia (link/QR unico).
 * A differenza del token email-bound, questo viene salvato in chiaro su
 * families.inviteCode: deve poter essere rimostrato (QR/link) più volte e
 * l'admin può rigenerarlo per invalidarlo. URL-safe, ~22 caratteri.
 */
export function generateJoinCode(): string {
  return randomBytes(16).toString('base64url');
}
