import { db } from '../db';
import { testAnalyticsEvents } from '../../shared/schema';
import { lt } from 'drizzle-orm';

/**
 * ANALYTICS INTERNA TEMPORANEA (periodo di test).
 *
 * - Attiva SOLO con ENABLE_TEST_ANALYTICS=true (flag assente/false = tutto spento:
 *   nessun evento salvato, nessun endpoint esposto, nessun pannello).
 * - Pannello e endpoint admin accessibili SOLO alle email in APP_OWNER_EMAILS
 *   (proprietario/admin tecnico dell'app, NON gli admin famiglia).
 * - Nessun contenuto personale: solo eventi tecnici minimi con metadata filtrato.
 * - Retention: massimo 30 giorni (pulizia automatica opportunistica).
 */

// Retention configurabile via env (TEST_ANALYTICS_RETENTION_DAYS), senza
// cambiare codice. Default e tetto massimo: 30 giorni, come dichiarato
// nella Privacy Policy v2.1 (il codice non deve mai superare la policy).
function resolveRetentionDays(): number {
  const raw = Number(process.env.TEST_ANALYTICS_RETENTION_DAYS);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 30) return Math.floor(raw);
  return 30;
}
export const RETENTION_DAYS = resolveRetentionDays();

// Eventi tecnici ammessi: tutto il resto viene rifiutato.
export const ALLOWED_EVENTS = new Set([
  'app_open',
  'login_success',
  'screen_view',
  'feature_used',
  'api_error',
  'premium_status_checked',
  'ai_toggle_changed',
  'delete_account_opened',
  'legal_page_opened',
]);

const ALLOWED_PLATFORMS = new Set(['web', 'android', 'ios']);

// Chiavi metadata ammesse (whitelist): mai contenuti liberi degli utenti.
const ALLOWED_METADATA_KEYS = new Set(['feature', 'status', 'code', 'route', 'source', 'enabled', 'durationMs']);
const METADATA_VALUE_MAX_LEN = 100;

export function isTestAnalyticsEnabled(): boolean {
  return process.env.ENABLE_TEST_ANALYTICS === 'true';
}

/** Allowlist proprietario app via env APP_OWNER_EMAILS (separatore virgola). */
export function isAppOwner(email: string | undefined | null): boolean {
  if (!email) return false;
  const raw = process.env.APP_OWNER_EMAILS || '';
  const allow = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}

/** Filtra i metadata: solo chiavi whitelisted, valori scalari troncati. */
export function sanitizeMetadata(input: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, METADATA_VALUE_MAX_LEN);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function sanitizePlatform(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const p = input.toLowerCase().trim();
  return ALLOWED_PLATFORMS.has(p) ? p : null;
}

/** Elimina gli eventi più vecchi di RETENTION_DAYS. Ritorna quanti ne restano da tenere. */
export async function pruneOldEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(testAnalyticsEvents).where(lt(testAnalyticsEvents.createdAt, cutoff));
}
