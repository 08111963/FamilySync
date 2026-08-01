import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { pushTokens, users, webPushSubscriptions } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { logger } from '../lib/logger';
import { isAppOwner } from '../lib/test-analytics';
import {
  getVapidPublicKey,
  isWebPushConfigured,
  sendWebPushToSingleSubscription,
} from '../lib/web-push';
import { isExpoPushToken, sendNativePushToSingleToken } from '../lib/push';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(1, "Token mancante"),
  platform: z.string().optional(),
});

router.post('/register', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" },
      });
    }

    const { token, platform } = parsed.data;
    const userId = req.user!.userId;

    await db
      .insert(pushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform, updatedAt: new Date() },
      });

    res.status(201).json({ message: 'Token registrato' });
  } catch (error) {
    logger.error('Register push token error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella registrazione del token" } });
  }
});

router.post('/unregister', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" },
      });
    }

    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, parsed.data.token), eq(pushTokens.userId, req.user!.userId)));
    res.json({ message: 'Token rimosso' });
  } catch (error) {
    logger.error('Unregister push token error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del token" } });
  }
});

// ————— Web push (PWA) —————

// Chiave pubblica VAPID: serve al browser per sottoscriversi.
router.get('/web/public-key', (_req: Request, res: Response) => {
  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: { code: 'WEB_PUSH_NOT_CONFIGURED', message: 'Notifiche web non configurate' } });
  }
  res.json({ publicKey: getVapidPublicKey() });
});

// Anti-SSRF: accettiamo SOLO endpoint HTTPS dei servizi push noti dei browser.
// Il server fa richieste in uscita verso questi endpoint: senza allow-list un
// utente potrebbe far chiamare al backend host interni/arbitrari.
const ALLOWED_PUSH_HOST_SUFFIXES = [
  '.googleapis.com',            // Chrome/FCM (fcm.googleapis.com)
  '.push.apple.com',            // Safari (web.push.apple.com)
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com',        // Edge/WNS
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  // Niente IP letterali o localhost: solo hostname dei provider noti.
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}

const webSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

router.post('/web/subscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = webSubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dati non validi' } });
    }
    const { endpoint, keys } = parsed.data;
    if (!isAllowedPushEndpoint(endpoint)) {
      return res.status(400).json({ error: { code: 'INVALID_ENDPOINT', message: 'Endpoint push non supportato' } });
    }
    const userId = req.user!.userId;

    // L'endpoint è unico per browser: al cambio account la sottoscrizione
    // viene riassociata al nuovo utente (rebind, come per i token nativi).
    await db
      .insert(webPushSubscriptions)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: { userId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() },
      });

    res.status(201).json({ message: 'Sottoscrizione registrata' });
  } catch (error) {
    logger.error('Web push subscribe error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella registrazione' } });
  }
});

const webUnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

router.post('/web/unsubscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = webUnsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dati non validi' } });
    }
    await db
      .delete(webPushSubscriptions)
      .where(and(
        eq(webPushSubscriptions.endpoint, parsed.data.endpoint),
        eq(webPushSubscriptions.userId, req.user!.userId),
      ));
    res.json({ message: 'Sottoscrizione rimossa' });
  } catch (error) {
    logger.error('Web push unsubscribe error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella rimozione' } });
  }
});

// ————— Notifica di prova (SOLO proprietario app) —————

// Stesso gating owner-only del pannello analytics/feedback (APP_OWNER_EMAILS,
// email riletta dal DB). Ai non proprietari risponde 404 per non rivelare
// l'esistenza dell'endpoint (pattern esistente di test-analytics).
async function requireAppOwner404(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Non trovato' } });
    }
    const [record] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);
    if (!record || !record.emailVerified || !isAppOwner(record.email)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Non trovato' } });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore durante la verifica dei permessi' } });
  }
}

// Rate limiter dedicato: la notifica di prova serve per diagnosi, non per spam.
// Route sempre autenticata: limitiamo per utente, non per IP (deployment autoscale).
const webTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? 'unauthenticated',
  message: { error: { code: 'RATE_LIMITED', message: 'Troppe notifiche di prova. Attendi un minuto e riprova.' } },
});

// GET /api/notifications/web/test/access — il client mostra il pulsante solo se 200.
router.get('/web/test/access', requireAppOwner404, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const webTestSchema = z.object({ endpoint: z.string().min(1).max(2000) });

// POST /api/notifications/web/test — invia una web push di prova SOLO alla
// sottoscrizione del dispositivo/browser corrente (endpoint passato dal client,
// verificato che appartenga all'utente autenticato).
router.post('/web/test', requireAppOwner404, webTestLimiter, async (req: Request, res: Response) => {
  try {
    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: { code: 'WEB_PUSH_NOT_CONFIGURED', message: 'Notifiche web non configurate sul server' } });
    }
    const parsed = webTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dati non validi' } });
    }

    // La sottoscrizione deve esistere ED essere associata all'utente corrente:
    // niente invii verso endpoint arbitrari o di altri account.
    const [sub] = await db
      .select({
        endpoint: webPushSubscriptions.endpoint,
        p256dh: webPushSubscriptions.p256dh,
        auth: webPushSubscriptions.auth,
      })
      .from(webPushSubscriptions)
      .where(and(
        eq(webPushSubscriptions.endpoint, parsed.data.endpoint),
        eq(webPushSubscriptions.userId, req.user!.userId),
      ))
      .limit(1);
    if (!sub) {
      return res.status(404).json({ error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Questo dispositivo non risulta registrato per le notifiche. Attiva prima le notifiche dal banner.' } });
    }

    const result = await sendWebPushToSingleSubscription(sub, {
      title: 'Notifica di prova',
      body: 'Se leggi questo messaggio, le notifiche web funzionano su questo dispositivo. ✅',
      data: { type: 'web_push_test' },
    });

    if (result.ok) {
      return res.json({ ok: true, message: 'Notifica inviata al servizio push' });
    }
    if (result.code === 'EXPIRED') {
      return res.status(410).json({ error: { code: 'SUBSCRIPTION_EXPIRED', message: 'La sottoscrizione di questo browser è scaduta ed è stata rimossa. Riattiva le notifiche e riprova.' } });
    }
    return res.status(502).json({ error: { code: 'PUSH_SEND_FAILED', message: `Il servizio push ha rifiutato l'invio${result.status ? ` (HTTP ${result.status})` : ''}. Riprova più tardi.` } });
  } catch (error) {
    logger.error('Web push test error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore durante l'invio della notifica di prova" } });
  }
});

const nativeTestSchema = z.object({ token: z.string().min(1).max(500) });

// POST /api/notifications/native/test — invia una push nativa di prova SOLO al
// token Expo del dispositivo corrente (passato dal client, verificato che
// appartenga all'utente autenticato in push_tokens). Stesso gating owner-only
// e rate limiter della notifica di prova web.
router.post('/native/test', requireAppOwner404, webTestLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = nativeTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dati non validi' } });
    }

    // Il token deve esistere ED essere associato all'utente corrente:
    // niente invii verso token arbitrari o di altri account.
    const [record] = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(and(
        eq(pushTokens.token, parsed.data.token),
        eq(pushTokens.userId, req.user!.userId),
      ))
      .limit(1);
    if (!record) {
      return res.status(404).json({ error: { code: 'TOKEN_NOT_FOUND', message: 'Questo dispositivo non risulta registrato per le notifiche. Attiva prima le notifiche dalle impostazioni.' } });
    }
    if (!isExpoPushToken(record.token)) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Il token di questo dispositivo non è un token Expo valido.' } });
    }

    const result = await sendNativePushToSingleToken(record.token, {
      title: 'Notifica di prova',
      body: 'Se leggi questo messaggio, le notifiche native funzionano su questo dispositivo. ✅',
      data: { type: 'native_push_test' },
    });

    if (result.ok) {
      return res.json({ ok: true, message: 'Notifica inviata al servizio push' });
    }
    if (result.code === 'DEVICE_NOT_REGISTERED') {
      return res.status(410).json({ error: { code: 'TOKEN_EXPIRED', message: 'Il token di questo dispositivo non è più valido ed è stato rimosso. Riapri l\'app per registrarlo di nuovo e riprova.' } });
    }
    return res.status(502).json({ error: { code: 'PUSH_SEND_FAILED', message: `Il servizio push ha rifiutato l'invio${'status' in result && result.status ? ` (HTTP ${result.status})` : ''}. Riprova più tardi.` } });
  } catch (error) {
    logger.error('Native push test error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore durante l'invio della notifica di prova" } });
  }
});

export default router;
