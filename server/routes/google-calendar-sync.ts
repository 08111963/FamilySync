import { Router } from 'express';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { googleCalendarConnections } from '../../shared/schema';
import { authenticate, requireEmailVerified } from '../middleware/auth';
import { isAllowedReturnUrl } from '../lib/oauth';
import {
  GOOGLE_CALENDAR_SCOPE,
  backfillUserCalendar,
  disconnectGoogleCalendar,
  exchangeGcalCode,
  getGcalRedirectUri,
  isGoogleCalendarSyncConfigured,
  saveConnection,
  signGcalOauthState,
  verifyGcalOauthState,
} from '../lib/google-calendar-sync';
import { logger } from '../lib/logger';

/**
 * Collegamento diretto a Google Calendar (per utente): OAuth con consenso
 * incrementale (scope calendar.events), scrittura eventi in tempo reale.
 * Il flusso è separato dal login social: il callback è pubblico (arriva dal
 * browser di Google) ma lo state firmato contiene l'utente autenticato.
 */
const router = Router();

/** Stato del collegamento dell'utente corrente. */
router.get('/google/status', authenticate, requireEmailVerified, async (req: Request, res: Response) => {
  try {
    if (!isGoogleCalendarSyncConfigured()) {
      return res.json({ available: false, connected: false });
    }
    const [conn] = await db
      .select({
        googleEmail: googleCalendarConnections.googleEmail,
        status: googleCalendarConnections.status,
        lastError: googleCalendarConnections.lastError,
        lastSyncAt: googleCalendarConnections.lastSyncAt,
      })
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, req.user!.userId))
      .limit(1);
    if (!conn) {
      return res.json({ available: true, connected: false });
    }
    res.json({
      available: true,
      connected: true,
      status: conn.status, // 'active' | 'expired'
      email: conn.googleEmail,
      lastError: conn.lastError,
      lastSyncAt: conn.lastSyncAt,
    });
  } catch (error) {
    logger.error('Gcal status error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero dello stato' } });
  }
});

/**
 * Ritorna l'URL di consenso Google da aprire nel browser. Il client è
 * autenticato qui (Bearer), quindi lo state firmato lega il collegamento
 * all'utente giusto anche se il callback è pubblico.
 */
router.post('/google/start-url', authenticate, requireEmailVerified, (req: Request, res: Response) => {
  if (!isGoogleCalendarSyncConfigured()) {
    return res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Collegamento Google non configurato' } });
  }
  const returnUrl = typeof req.body?.returnUrl === 'string' ? req.body.returnUrl : '';
  if (!isAllowedReturnUrl(returnUrl)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'returnUrl non valido' } });
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: getGcalRedirectUri(),
    response_type: 'code',
    // Consenso incrementale: chiediamo SOLO lo scope calendario (più email
    // per mostrare quale account è collegato), senza toccare il login social.
    scope: `${GOOGLE_CALENDAR_SCOPE} openid email`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: signGcalOauthState(req.user!.userId, returnUrl),
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

/**
 * Callback OAuth (pubblico: ci arriva il browser da Google). Salva il
 * collegamento e avvia in background la copia degli eventi futuri.
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state) return res.status(400).send('Richiesta non valida.');
    const { userId, returnUrl } = verifyGcalOauthState(state);
    if (!isAllowedReturnUrl(returnUrl)) return res.status(400).send('returnUrl non valido.');
    const sep = returnUrl.includes('?') ? '&' : '?';
    if (!code) {
      // L'utente ha negato il consenso: torno all'app senza collegare nulla.
      return res.redirect(`${returnUrl}${sep}gcal=denied`);
    }
    const tokens = await exchangeGcalCode(code);
    await saveConnection(userId, tokens);
    // Copia iniziale degli eventi futuri in background (non blocca il redirect).
    void backfillUserCalendar(userId);
    res.redirect(`${returnUrl}${sep}gcal=connected`);
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (msg.includes('MISSING_CALENDAR_SCOPE')) {
      logger.warn('Gcal callback: scope calendario non concesso');
      return res.status(400).send('Per collegare il calendario devi concedere l\'accesso a Google Calendar. Riprova e spunta la casella del calendario.');
    }
    logger.error('Gcal callback error', { error: msg });
    res.status(500).send('Errore durante il collegamento con Google Calendar. Riprova.');
  }
});

/** Scollega: revoca il token presso Google e rimuove collegamento e mapping. */
router.post('/google/disconnect', authenticate, requireEmailVerified, async (req: Request, res: Response) => {
  try {
    await disconnectGoogleCalendar(req.user!.userId);
    res.json({ message: 'Google Calendar scollegato' });
  } catch (error) {
    logger.error('Gcal disconnect error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nello scollegamento' } });
  }
});

export default router;
