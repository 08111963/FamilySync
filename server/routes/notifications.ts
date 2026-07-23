import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { pushTokens, webPushSubscriptions } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { logger } from '../lib/logger';
import { getVapidPublicKey, isWebPushConfigured } from '../lib/web-push';

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

export default router;
