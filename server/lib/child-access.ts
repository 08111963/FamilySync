import crypto from 'crypto';

/**
 * Codici di accesso "dispositivo bambino".
 *
 * Il codice è breve (deve poterlo digitare un bambino) ma con entropia
 * sufficiente: 8 caratteri da un alfabeto di 30 simboli non ambigui
 * (~4,9e11 combinazioni) + rate limiter dedicato sull'endpoint pubblico
 * + scadenza breve + monouso. Nel DB viene salvato SOLO l'hash SHA-256
 * (stesso pattern degli inviti sicuri).
 */

// Alfabeto senza caratteri ambigui (niente 0/O, 1/I/L, 5/S, 8/B).
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ234679';
const CODE_LENGTH = 8;

/** Durata di validità del codice non ancora usato. */
export const CHILD_CODE_TTL_MS = 48 * 60 * 60 * 1000; // 48 ore

/** Dominio sintetico NON recapitabile per le email degli account bambino. */
export const CHILD_EMAIL_DOMAIN = 'child.familysync.invalid';

export function childSyntheticEmail(memberId: string): string {
  return `child-${memberId}@${CHILD_EMAIL_DOMAIN}`;
}

export function isChildSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${CHILD_EMAIL_DOMAIN}`);
}

/** Genera il codice in chiaro (mostrato UNA volta al genitore). */
export function generateChildAccessCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalizza l'input del bambino (maiuscole, senza spazi/trattini). */
export function normalizeChildAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashChildAccessCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeChildAccessCode(code)).digest('hex');
}

/** Formattazione leggibile "ABCD-EFGH" per la UI del genitore. */
export function formatChildAccessCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
