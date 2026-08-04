import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { lt } from 'drizzle-orm';
import { db } from '../db';
import { consumedOauthCodes } from '../../shared/schema';
import { logger } from './logger';

const isProduction = process.env.NODE_ENV === 'production';

function deriveFromSessionSecret(purpose: string): string | undefined {
  const base = process.env.SESSION_SECRET;
  if (base && base.length > 0) {
    return crypto.createHash('sha256').update(`${base}:${purpose}`).digest('hex');
  }
  return undefined;
}

function resolveSecret(purpose: string, devFallback: string): string {
  const derived = deriveFromSessionSecret(purpose);
  if (derived) return derived;
  if (isProduction) {
    throw new Error('[FATAL] SESSION_SECRET è obbligatoria in produzione per il login social.');
  }
  return devFallback;
}

// Secret dedicati (derivati da SESSION_SECRET) per lo state OAuth e il codice
// di login monouso che il client scambia con i token di sessione.
const OAUTH_STATE_SECRET = resolveSecret('oauth-state', 'dev-oauth-state-secret');
const LOGIN_CODE_SECRET = resolveSecret('oauth-login-code', 'dev-oauth-code-secret');

export function isGoogleLoginConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * URL pubblico del backend, usato come base per il redirect URI di Google.
 * In produzione usa CLIENT_URL (es. https://familysync.eu), in dev il dominio Replit.
 */
export function getPublicBaseUrl(): string {
  if (isProduction && process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  // Nota: in dev il dominio Replit senza porta punta al server web Expo (8081),
  // non al backend. Il callback OAuth deve quindi includere la porta :5000.
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}:5000`;
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  return 'http://localhost:5000';
}

export function getGoogleRedirectUri(): string {
  return `${getPublicBaseUrl()}/api/auth/google/callback`;
}

/**
 * Valida il returnUrl fornito dal client per evitare open redirect: sono
 * ammessi solo lo schema nativo dell'app, i deep link di Expo Go e le origini
 * web conosciute (dominio dev, CLIENT_URL, EXPO_PUBLIC_DOMAIN, localhost).
 */
export function isAllowedReturnUrl(returnUrl: string): boolean {
  if (!returnUrl || returnUrl.length > 2000) return false;
  if (returnUrl.startsWith('myapp://')) return true;
  // Deep link Expo Go: ammessi SOLO in sviluppo (in produzione l'app usa lo
  // schema nativo myapp:// o il dominio web).
  if (!isProduction && /^exps?(\+[a-z0-9-]+)?:\/\//i.test(returnUrl)) return true;
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set<string>();
  if (process.env.REPLIT_DEV_DOMAIN) allowedHosts.add(process.env.REPLIT_DEV_DOMAIN.toLowerCase());
  for (const envName of ['CLIENT_URL', 'EXPO_PUBLIC_DOMAIN'] as const) {
    const v = process.env[envName];
    if (!v) continue;
    try {
      allowedHosts.add(new URL(v.startsWith('http') ? v : `https://${v}`).hostname.toLowerCase());
    } catch {
      allowedHosts.add(v.replace(/^https?:\/\//, '').split('/')[0].toLowerCase());
    }
  }
  if (!isProduction) {
    allowedHosts.add('localhost');
    allowedHosts.add('127.0.0.1');
  }
  return allowedHosts.has(host);
}

interface OauthStatePayload {
  returnUrl: string;
  purpose: 'google-oauth-state';
}

/** Firma lo state OAuth (contiene il returnUrl) con scadenza breve. */
export function signOauthState(returnUrl: string): string {
  return jwt.sign({ returnUrl, purpose: 'google-oauth-state' } satisfies OauthStatePayload, OAUTH_STATE_SECRET, {
    expiresIn: '10m',
  });
}

export function verifyOauthState(state: string): { returnUrl: string } {
  const decoded = jwt.verify(state, OAUTH_STATE_SECRET) as OauthStatePayload;
  if (decoded.purpose !== 'google-oauth-state' || !decoded.returnUrl) {
    throw new Error('Invalid oauth state');
  }
  return { returnUrl: decoded.returnUrl };
}

interface LoginCodePayload {
  userId: string;
  jti: string;
  purpose: 'oauth-login-code';
}

const LOGIN_CODE_TTL_MS = 2 * 60 * 1000;

/**
 * Codice di login monouso (breve scadenza): viene passato nel redirect di
 * ritorno all'app, che lo scambia con access+refresh token via POST.
 * Così i token di sessione non transitano mai nell'URL.
 */
export function signLoginCode(userId: string): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ userId, jti, purpose: 'oauth-login-code' } satisfies LoginCodePayload, LOGIN_CODE_SECRET, {
    expiresIn: '2m',
  });
}

/**
 * Verifica e CONSUMA il codice: un secondo utilizzo viene rifiutato.
 * Il registro dei codici consumati vive sul DB CONDIVISO (non in-memory):
 * su autoscale girano più istanze e una mappa per-processo permetterebbe il
 * replay dello stesso codice su un'istanza diversa. L'INSERT è atomico:
 * ON CONFLICT DO NOTHING → zero righe inserite = codice già usato.
 */
export async function verifyLoginCode(code: string): Promise<{ userId: string }> {
  const decoded = jwt.verify(code, LOGIN_CODE_SECRET) as LoginCodePayload;
  if (decoded.purpose !== 'oauth-login-code' || !decoded.userId || !decoded.jti) {
    throw new Error('Invalid login code');
  }
  if (decoded.jti.length > 64) {
    throw new Error('Invalid login code');
  }
  const inserted = await db
    .insert(consumedOauthCodes)
    .values({ jti: decoded.jti, expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) })
    .onConflictDoNothing()
    .returning({ jti: consumedOauthCodes.jti });
  if (inserted.length === 0) {
    throw new Error('Login code already used');
  }
  // Pulizia best-effort delle righe scadute (fail-safe: non blocca il login).
  Promise.resolve(
    db.delete(consumedOauthCodes).where(lt(consumedOauthCodes.expiresAt, new Date()))
  ).catch((err) => logger.warn('Consumed oauth codes cleanup failed', { error: String(err) }));
  return { userId: decoded.userId };
}

export interface OauthProfile {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Scambia il code Google con i token e verifica l'id_token con il JWKS
 * pubblico di Google (firma, issuer, audience, scadenza). L'email deve
 * risultare verificata dal provider prima di autenticare/creare l'account.
 */
export async function exchangeGoogleCode(code: string): Promise<OauthProfile> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error('Google token exchange failed', { status: res.status, body: body.slice(0, 300) });
    throw new Error('Google token exchange failed');
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error('Google response missing id_token');
  const { payload } = await jwtVerify(data.id_token, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (!email) throw new Error('Google id_token missing email');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) throw new Error('Google email not verified');
  return {
    email,
    emailVerified: true,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Audience ammesse per Sign in with Apple: bundle id dell'app e, in sviluppo,
// il client di Expo Go.
const APPLE_AUDIENCES = ['com.familysyncapp.coordinator', 'host.exp.Exponent'];

/**
 * Verifica l'identityToken di Apple (firma via JWKS pubblico, issuer e audience).
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<OauthProfile> {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: isProduction ? ['com.familysyncapp.coordinator'] : APPLE_AUDIENCES,
  });
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (!email) throw new Error('Apple identity token missing email');
  // Apple può omettere email_verified nei token successivi al primo: se il
  // claim è presente e falso, rifiutiamo il collegamento per email.
  if (payload.email_verified === false || payload.email_verified === 'false') {
    throw new Error('Apple email not verified');
  }
  return { email, emailVerified: true, name: null };
}
