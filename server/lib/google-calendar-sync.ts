import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  calendarEvents,
  familyMembers,
  googleCalendarConnections,
  googleCalendarEventLinks,
  users,
  type CalendarEvent,
} from '../../shared/schema';
import { getBlockRelatedUserIds } from './block-filter';
import { normalizeTimeOfDay } from '../../shared/chore-recurrence';
import { sendPushToUser } from './push';
import { sendGcalConnectionExpiredEmail } from './email';
import { getPublicBaseUrl } from './oauth';
import { logger } from './logger';
import { startDurableScheduler } from './scheduled-jobs';

const isProduction = process.env.NODE_ENV === 'production';

/** Fuso orario degli eventi FamilySync (coerente con il feed ICS). */
const EVENT_TIMEZONE = 'Europe/Rome';
/** Scope Google Calendar richiesto (solo eventi, non l'intero calendario). */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** Massimo eventi copiati nel backfill iniziale dopo il collegamento. */
const BACKFILL_MAX_EVENTS = 250;

// ---------------------------------------------------------------------------
// Cifratura del refresh token (AES-256-GCM, chiave derivata da SESSION_SECRET)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const base = process.env.SESSION_SECRET;
  if (base && base.length > 0) {
    return crypto.createHash('sha256').update(`${base}:gcal-token-encryption`).digest();
  }
  if (isProduction) {
    throw new Error('[FATAL] SESSION_SECRET è obbligatoria in produzione per Google Calendar sync.');
  }
  return crypto.createHash('sha256').update('dev-gcal-token-encryption').digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted token format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// State OAuth (contiene l'utente che sta collegando il calendario)
// ---------------------------------------------------------------------------

function getStateSecret(): string {
  const base = process.env.SESSION_SECRET;
  if (base && base.length > 0) {
    return crypto.createHash('sha256').update(`${base}:gcal-oauth-state`).digest('hex');
  }
  if (isProduction) {
    throw new Error('[FATAL] SESSION_SECRET è obbligatoria in produzione per Google Calendar sync.');
  }
  return 'dev-gcal-oauth-state-secret';
}

interface GcalStatePayload {
  userId: string;
  returnUrl: string;
  purpose: 'gcal-oauth-state';
}

export function signGcalOauthState(userId: string, returnUrl: string): string {
  return jwt.sign(
    { userId, returnUrl, purpose: 'gcal-oauth-state' } satisfies GcalStatePayload,
    getStateSecret(),
    { expiresIn: '10m' },
  );
}

export function verifyGcalOauthState(state: string): { userId: string; returnUrl: string } {
  const decoded = jwt.verify(state, getStateSecret()) as GcalStatePayload;
  if (decoded.purpose !== 'gcal-oauth-state' || !decoded.userId || !decoded.returnUrl) {
    throw new Error('Invalid gcal oauth state');
  }
  return { userId: decoded.userId, returnUrl: decoded.returnUrl };
}

export function isGoogleCalendarSyncConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function getGcalRedirectUri(): string {
  return `${getPublicBaseUrl()}/api/calendar-sync/google/callback`;
}

// ---------------------------------------------------------------------------
// Scambio code e refresh dei token
// ---------------------------------------------------------------------------

export interface GcalTokens {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  email: string | null;
}

/**
 * Scambia il code OAuth con i token. Richiede che Google ritorni un
 * refresh_token (garantito da access_type=offline + prompt=consent).
 */
export async function exchangeGcalCode(code: string): Promise<GcalTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: getGcalRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error('Gcal token exchange failed', { status: res.status, body: body.slice(0, 300) });
    throw new Error('Google Calendar token exchange failed');
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
  };
  if (!data.access_token) throw new Error('Google response missing access_token');
  if (!data.refresh_token) throw new Error('MISSING_REFRESH_TOKEN');
  if (!data.scope || !data.scope.includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new Error('MISSING_CALENDAR_SCOPE');
  }
  // Email informativa dal payload dell'id_token (la firma non serve qui: il
  // token arriva direttamente da Google via canale server-to-server TLS).
  let email: string | null = null;
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'));
      if (typeof payload.email === 'string') email = payload.email.toLowerCase();
    } catch {}
  }
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    email,
  };
}

/** Errore che indica collegamento revocato/scaduto: serve ricollegare. */
export class GcalConnectionExpiredError extends Error {
  constructor() {
    super('Google Calendar connection expired');
    this.name = 'GcalConnectionExpiredError';
  }
}

// Cache in-memory degli access token per utente (per-istanza: su autoscale
// ogni istanza si rinnova da sé, i refresh token Google supportano access
// token concorrenti).
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Segna il collegamento come scaduto: fail-visibile, mai silenzioso.
 * Alla PRIMA transizione active→expired avvisa subito l'utente (push + email,
 * best-effort). Il dedup è atomico: l'UPDATE tocca solo righe ancora 'active',
 * quindi anche con chiamate concorrenti la notifica parte una volta sola.
 */
export async function markConnectionExpired(userId: string, reason: string): Promise<void> {
  accessTokenCache.delete(userId);
  const transitioned = await db
    .update(googleCalendarConnections)
    .set({ status: 'expired', lastError: reason.slice(0, 500), updatedAt: new Date() })
    .where(
      and(
        eq(googleCalendarConnections.userId, userId),
        eq(googleCalendarConnections.status, 'active'),
      ),
    )
    .returning({ userId: googleCalendarConnections.userId });
  if (transitioned.length === 0) {
    // Già 'expired' (o collegamento assente): aggiorna solo il motivo, niente notifica.
    await db
      .update(googleCalendarConnections)
      .set({ lastError: reason.slice(0, 500), updatedAt: new Date() })
      .where(eq(googleCalendarConnections.userId, userId));
    return;
  }
  await notifyConnectionExpired(userId, reason);
}

/** Avvisa l'utente (push + email) che deve ricollegare Google Calendar. Best-effort. */
async function notifyConnectionExpired(userId: string, reason: string): Promise<void> {
  try {
    await sendPushToUser(userId, {
      title: 'Google Calendar scollegato',
      body: 'Il collegamento è scaduto: ricollegalo per continuare a ricevere gli eventi nel tuo calendario.',
      data: { type: 'gcal_connection_expired', url: '/calendar-sync' },
    });
  } catch (err) {
    logger.error('Gcal expired push notify failed', { userId, error: String(err) });
  }
  try {
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.email) {
      await sendGcalConnectionExpiredEmail({
        to: user.email,
        recipientName: user.name,
        reason,
      });
    }
  } catch (err) {
    logger.error('Gcal expired email notify failed', { userId, error: String(err) });
  }
}

/** Registra l'ultimo errore di sync senza invalidare il collegamento. */
async function recordSyncError(userId: string, reason: string): Promise<void> {
  await db
    .update(googleCalendarConnections)
    .set({ lastError: reason.slice(0, 500), updatedAt: new Date() })
    .where(eq(googleCalendarConnections.userId, userId))
    .catch?.(() => {});
}

async function recordSyncOk(userId: string): Promise<void> {
  await db
    .update(googleCalendarConnections)
    .set({ lastError: null, lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(googleCalendarConnections.userId, userId));
}

/**
 * Access token valido per l'utente: usa la cache oppure rinnova col refresh
 * token. Su invalid_grant (revoca/scadenza) marca il collegamento 'expired'.
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const cached = accessTokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const [conn] = await db
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, userId))
    .limit(1);
  if (!conn) throw new Error('No Google Calendar connection');
  if (conn.status !== 'active') throw new GcalConnectionExpiredError();

  let refreshToken: string;
  try {
    refreshToken = decryptToken(conn.refreshTokenEnc);
  } catch (err) {
    await markConnectionExpired(userId, 'Token cifrato non leggibile: ricollega il calendario.');
    throw new GcalConnectionExpiredError();
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes('invalid_grant')) {
      await markConnectionExpired(userId, 'Accesso revocato o scaduto: ricollega Google Calendar.');
      throw new GcalConnectionExpiredError();
    }
    logger.error('Gcal token refresh failed', { status: res.status, body: body.slice(0, 300) });
    throw new Error('Google Calendar token refresh failed');
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google refresh missing access_token');
  accessTokenCache.set(userId, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

/** Revoca il refresh token presso Google (best-effort) e rimuove il collegamento. */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, userId))
    .limit(1);
  if (conn) {
    try {
      const token = decryptToken(conn.refreshTokenEnc);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
    } catch (err) {
      logger.warn('Gcal token revoke failed (continuo comunque)', { error: String(err) });
    }
  }
  accessTokenCache.delete(userId);
  await db.delete(googleCalendarEventLinks).where(eq(googleCalendarEventLinks.userId, userId));
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId));
}

/** Salva (o sostituisce) il collegamento dell'utente. */
export async function saveConnection(userId: string, tokens: GcalTokens): Promise<void> {
  accessTokenCache.set(userId, {
    token: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  });
  const refreshTokenEnc = encryptToken(tokens.refreshToken);
  await db
    .insert(googleCalendarConnections)
    .values({ userId, googleEmail: tokens.email, refreshTokenEnc, status: 'active' })
    .onConflictDoUpdate({
      target: googleCalendarConnections.userId,
      set: {
        googleEmail: tokens.email,
        refreshTokenEnc,
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Conversione evento FamilySync → evento Google Calendar
// ---------------------------------------------------------------------------

/** Aggiunge giorni a una data ISO (AAAA-MM-GG). */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Somma minuti a un orario HH:MM; ritorna anche l'eventuale scavalco di giorno. */
function addMinutes(time: string, minutes: number): { time: string; dayOffset: number } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const dayOffset = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return {
    time: `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`,
    dayOffset,
  };
}

export function eventToGooglePayload(ev: CalendarEvent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description || undefined,
    location: ev.location || undefined,
    // Riferimento all'evento FamilySync: utile per riconoscere gli eventi
    // creati dall'app anche a mano dentro Google Calendar.
    extendedProperties: { private: { familySyncEventId: ev.id } },
    // Promemoria controllati da noi, non dai default del calendario Google:
    // senza questo, gli eventi "tutto il giorno" ereditavano il promemoria
    // automatico di Google che suona la sera prima (es. 23:30). Eventi con
    // orario: avviso 1 ora prima. Eventi tutto il giorno: nessun promemoria
    // Google (ci pensano già le notifiche FamilySync).
    reminders: ev.allDay || !normalizeTimeOfDay(ev.time)
      ? { useDefault: false, overrides: [] }
      : { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
  };
  // Normalizzazione difensiva: in DB esistono orari malformati ("15" senza
  // minuti) salvati prima della validazione — un dateTime tipo "…T15:00"
  // (costruito da "15") viene rifiutato da Google con 400 Bad Request.
  const startTime = ev.allDay ? null : normalizeTimeOfDay(ev.time);
  if (!startTime) {
    // Evento "tutto il giorno" (o con orario irrecuperabile): end esclusivo
    // il giorno successivo.
    base.start = { date: ev.date };
    base.end = { date: addDays(ev.date, 1) };
    return base;
  }
  let endDate = ev.date;
  let endTime = normalizeTimeOfDay(ev.endTime);
  if (endTime) {
    // Come nel feed ICS: se la fine è <= inizio, l'evento scavalca la mezzanotte.
    if (endTime <= startTime) endDate = addDays(ev.date, 1);
  } else {
    const plus = addMinutes(startTime, 60);
    endTime = plus.time;
    if (plus.dayOffset > 0) endDate = addDays(ev.date, plus.dayOffset);
  }
  base.start = { dateTime: `${ev.date}T${startTime}:00`, timeZone: EVENT_TIMEZONE };
  base.end = { dateTime: `${endDate}T${endTime}:00`, timeZone: EVENT_TIMEZONE };
  return base;
}

// ---------------------------------------------------------------------------
// Chiamate all'API Google Calendar
// ---------------------------------------------------------------------------

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function gcalFetch(
  userId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const doFetch = async (token: string) =>
    fetch(`${CALENDAR_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(await getAccessTokenForUser(userId));
  if (res.status === 401) {
    // Access token appena invalidato: un solo retry con token fresco.
    accessTokenCache.delete(userId);
    res = await doFetch(await getAccessTokenForUser(userId));
    if (res.status === 401) {
      await markConnectionExpired(userId, 'Autorizzazione Google non più valida: ricollega il calendario.');
      throw new GcalConnectionExpiredError();
    }
  }
  if (res.status === 403) {
    const text = await res.clone().text();
    if (text.includes('insufficientPermissions') || text.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      await markConnectionExpired(userId, 'Permesso calendario mancante: ricollega e concedi l\'accesso al calendario.');
      throw new GcalConnectionExpiredError();
    }
  }
  return res;
}

/** Crea l'evento su Google e salva il mapping. Ritorna false se fallisce. */
async function pushEventToUser(userId: string, ev: CalendarEvent): Promise<boolean> {
  const res = await gcalFetch(userId, 'POST', '', eventToGooglePayload(ev));
  if (!res.ok) {
    const text = await res.text();
    logger.error('Gcal insert failed', { userId, eventId: ev.id, status: res.status, body: text.slice(0, 200) });
    await recordSyncError(userId, `Errore Google (${res.status}) durante la creazione di un evento.`);
    return false;
  }
  const created = (await res.json()) as { id?: string };
  if (!created.id) return false;
  await db
    .insert(googleCalendarEventLinks)
    .values({ userId, eventId: ev.id, googleEventId: created.id })
    .onConflictDoUpdate({
      target: [googleCalendarEventLinks.userId, googleCalendarEventLinks.eventId],
      set: { googleEventId: created.id },
    });
  return true;
}

/** Utenti della famiglia con collegamento Google Calendar ATTIVO. */
async function getConnectedFamilyUserIds(familyId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: googleCalendarConnections.userId })
    .from(googleCalendarConnections)
    .innerJoin(familyMembers, eq(familyMembers.userId, googleCalendarConnections.userId))
    .where(and(eq(familyMembers.familyId, familyId), eq(googleCalendarConnections.status, 'active')));
  return rows.map((r) => r.userId);
}

/**
 * Riflette eventi appena CREATI nei Google Calendar dei membri collegati
 * (esclusi gli utenti in blocco reciproco con il creatore, come per le push).
 * Da chiamare in background (void ...): non blocca mai la risposta HTTP.
 */
export async function syncCreatedEvents(
  familyId: string,
  events: CalendarEvent[],
  creatorUserId: string,
): Promise<void> {
  try {
    const userIds = await getConnectedFamilyUserIds(familyId);
    if (userIds.length === 0) return;
    const blockRelated = new Set(await getBlockRelatedUserIds(creatorUserId, familyId));
    for (const userId of userIds) {
      if (userId !== creatorUserId && blockRelated.has(userId)) continue;
      try {
        let allOk = true;
        for (const ev of events) {
          const ok = await pushEventToUser(userId, ev);
          if (!ok) allOk = false;
        }
        if (allOk) await recordSyncOk(userId);
      } catch (err) {
        if (!(err instanceof GcalConnectionExpiredError)) {
          logger.error('Gcal create sync failed', { userId, error: String(err) });
          await recordSyncError(userId, 'Sincronizzazione non riuscita: riprova o ricollega il calendario.').catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.error('Gcal create sync fanout failed', { familyId, error: String(err) });
  }
}

/** Riflette un evento MODIFICATO su tutti i Google Calendar collegati. */
export async function syncUpdatedEvent(event: CalendarEvent): Promise<void> {
  try {
    const links = await db
      .select()
      .from(googleCalendarEventLinks)
      .where(eq(googleCalendarEventLinks.eventId, event.id));
    for (const link of links) {
      try {
        const res = await gcalFetch(
          link.userId,
          'PATCH',
          `/${encodeURIComponent(link.googleEventId)}`,
          eventToGooglePayload(event),
        );
        if (res.status === 404 || res.status === 410) {
          // L'utente l'ha cancellato a mano su Google: lo ricreiamo.
          await db.delete(googleCalendarEventLinks).where(eq(googleCalendarEventLinks.id, link.id));
          await pushEventToUser(link.userId, event);
        } else if (!res.ok) {
          const text = await res.text();
          logger.error('Gcal patch failed', { userId: link.userId, status: res.status, body: text.slice(0, 200) });
          await recordSyncError(link.userId, `Errore Google (${res.status}) durante l'aggiornamento di un evento.`);
        } else {
          await recordSyncOk(link.userId);
        }
      } catch (err) {
        if (!(err instanceof GcalConnectionExpiredError)) {
          logger.error('Gcal update sync failed', { userId: link.userId, error: String(err) });
        }
      }
    }
  } catch (err) {
    logger.error('Gcal update sync fanout failed', { eventId: event.id, error: String(err) });
  }
}

/**
 * Cancella dagli account Google gli eventi eliminati. I link vanno letti
 * PRIMA della delete su DB (cascade): passare qui la lista già raccolta.
 */
export async function syncDeletedEvents(
  links: Array<{ userId: string; googleEventId: string }>,
): Promise<void> {
  for (const link of links) {
    try {
      const res = await gcalFetch(link.userId, 'DELETE', `/${encodeURIComponent(link.googleEventId)}`);
      // 404/410 = già rimosso su Google: va bene così.
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const text = await res.text();
        logger.error('Gcal delete failed', { userId: link.userId, status: res.status, body: text.slice(0, 200) });
        await recordSyncError(link.userId, `Errore Google (${res.status}) durante l'eliminazione di un evento.`);
      }
    } catch (err) {
      if (!(err instanceof GcalConnectionExpiredError)) {
        logger.error('Gcal delete sync failed', { userId: link.userId, error: String(err) });
      }
    }
  }
}

/** Legge i mapping Google per una lista di eventi (da fare PRIMA della delete). */
export async function getLinksForEvents(
  eventIds: string[],
): Promise<Array<{ userId: string; googleEventId: string }>> {
  if (eventIds.length === 0) return [];
  return db
    .select({
      userId: googleCalendarEventLinks.userId,
      googleEventId: googleCalendarEventLinks.googleEventId,
    })
    .from(googleCalendarEventLinks)
    .where(inArray(googleCalendarEventLinks.eventId, eventIds));
}

/**
 * Backfill iniziale dopo il collegamento: copia nel Google Calendar
 * dell'utente gli eventi futuri delle sue famiglie non ancora sincronizzati.
 */
export async function backfillUserCalendar(userId: string): Promise<void> {
  try {
    const memberships = await db
      .select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId));
    if (memberships.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);

    const existing = new Set(
      (
        await db
          .select({ eventId: googleCalendarEventLinks.eventId })
          .from(googleCalendarEventLinks)
          .where(eq(googleCalendarEventLinks.userId, userId))
      ).map((r) => r.eventId),
    );

    let pushed = 0;
    for (const { familyId } of memberships) {
      // Stessa esclusione di syncCreatedEvents: gli eventi creati da utenti in
      // blocco reciproco con il destinatario non vanno copiati sul suo Google.
      const blockRelated = new Set(await getBlockRelatedUserIds(userId, familyId));
      const events = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.familyId, familyId), gte(calendarEvents.date, today)));
      for (const ev of events) {
        if (existing.has(ev.id)) continue;
        if (ev.createdBy && ev.createdBy !== userId && blockRelated.has(ev.createdBy)) continue;
        if (pushed >= BACKFILL_MAX_EVENTS) return;
        await pushEventToUser(userId, ev);
        pushed += 1;
      }
    }
    await recordSyncOk(userId);
  } catch (err) {
    if (!(err instanceof GcalConnectionExpiredError)) {
      logger.error('Gcal backfill failed', { userId, error: String(err) });
      await recordSyncError(userId, 'Copia iniziale degli eventi non completata.').catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Riconciliazione periodica: recupera gli eventi rimasti fuori da Google
// dopo errori temporanei (rate limit, rete). La scrittura in tempo reale
// avviene in background su crea/modifica/cancella: se Google fallisce lì,
// l'evento resta senza riga in google_calendar_event_links finché qualcuno
// non lo ri-modifica. Questo job colma i buchi riusando backfillUserCalendar
// (che salta gli eventi già collegati: nessun doppione, vincolo UNIQUE
// user+event sul mapping).
// ---------------------------------------------------------------------------

/** Nome del job nella tabella scheduled_job_runs. */
export const GCAL_RECONCILE_JOB_NAME = 'gcal_reconcile_hourly';

/** Ogni quanto questa istanza tenta il claim. */
const GCAL_RECONCILE_POLL_INTERVAL_MS = 60 * 60 * 1000; // ogni ora

/**
 * Finestra minima tra due run: poco meno dell'intervallo di poll, così la
 * cadenza resta davvero oraria anche se i tick arrivano in ritardo.
 */
export const GCAL_RECONCILE_MIN_INTERVAL_MS = 50 * 60 * 1000;

/**
 * Rimuove dai Google Calendar gli eventi di utenti in blocco reciproco con il
 * destinatario che erano stati copiati PRIMA del fix del backfill (righe in
 * google_calendar_event_links create quando l'esclusione non esisteva).
 * Cancella l'evento dal Google Calendar dell'utente e rimuove il link.
 * Esportata per i test; usata dalla riconciliazione oraria.
 */
export async function removeBlockedEventLinks(): Promise<void> {
  try {
    // Tutti i link dove l'evento è stato creato da un ALTRO utente.
    const rows = await db
      .select({
        linkId: googleCalendarEventLinks.id,
        userId: googleCalendarEventLinks.userId,
        googleEventId: googleCalendarEventLinks.googleEventId,
        createdBy: calendarEvents.createdBy,
        familyId: calendarEvents.familyId,
      })
      .from(googleCalendarEventLinks)
      .innerJoin(calendarEvents, eq(calendarEvents.id, googleCalendarEventLinks.eventId));

    // Cache blocchi per coppia (utente, famiglia): una query per coppia.
    const blockCache = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.createdBy || row.createdBy === row.userId) continue;
      const cacheKey = `${row.userId}:${row.familyId}`;
      let blockRelated = blockCache.get(cacheKey);
      if (!blockRelated) {
        blockRelated = new Set(await getBlockRelatedUserIds(row.userId, row.familyId));
        blockCache.set(cacheKey, blockRelated);
      }
      if (!blockRelated.has(row.createdBy)) continue;
      try {
        const res = await gcalFetch(row.userId, 'DELETE', `/${encodeURIComponent(row.googleEventId)}`);
        // 404/410 = già rimosso su Google: va bene, togliamo comunque il link.
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          const text = await res.text();
          logger.error('Gcal blocked-event cleanup delete failed', {
            userId: row.userId,
            status: res.status,
            body: text.slice(0, 200),
          });
          continue; // link mantenuto: ritenterà alla prossima riconciliazione
        }
        await db.delete(googleCalendarEventLinks).where(eq(googleCalendarEventLinks.id, row.linkId));
      } catch (err) {
        if (!(err instanceof GcalConnectionExpiredError)) {
          logger.error('Gcal blocked-event cleanup failed', { userId: row.userId, error: String(err) });
        }
      }
    }
  } catch (err) {
    logger.error('Gcal blocked-event cleanup fanout failed', { error: String(err) });
  }
}

/**
 * Un singolo passaggio di riconciliazione (esportato per i test):
 * per ogni utente con collegamento 'active' esegue il backfill degli eventi
 * futuri non ancora sincronizzati. backfillUserCalendar gestisce già i propri
 * errori per-utente (log + lastError, mai throw): un utente con problemi non
 * blocca gli altri.
 */
export async function runGcalReconcileOnce(): Promise<void> {
  // Prima la pulizia dei link verso eventi di utenti bloccati (copiati dai
  // backfill precedenti al fix), poi il backfill dei buchi.
  await removeBlockedEventLinks();
  const rows = await db
    .select({ userId: googleCalendarConnections.userId })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.status, 'active'));
  for (const { userId } of rows) {
    await backfillUserCalendar(userId);
  }
}

/**
 * Avvia lo scheduler di riconciliazione Google Calendar: claim atomico e
 * durevole su DB (scheduled_job_runs), stesso pattern dei promemoria eventi.
 * Sicuro con più istanze: una sola vince il claim, e comunque il mapping
 * unique user+event previene i doppioni su Google.
 */
export function startGcalReconcileScheduler(): void {
  if (!isGoogleCalendarSyncConfigured()) {
    logger.info('Gcal reconcile scheduler NON avviato: OAuth Google non configurato.');
    return;
  }
  startDurableScheduler({
    jobName: GCAL_RECONCILE_JOB_NAME,
    minIntervalMs: GCAL_RECONCILE_MIN_INTERVAL_MS,
    pollIntervalMs: GCAL_RECONCILE_POLL_INTERVAL_MS,
    // Primo giro dopo 90 secondi (dopo i promemoria, lascia respirare l'avvio).
    firstRunDelayMs: 90 * 1000,
    run: runGcalReconcileOnce,
  });
}
