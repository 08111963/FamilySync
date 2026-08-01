import webpush from 'web-push';
import { db } from '../db';
import { webPushSubscriptions } from '../../shared/schema';
import { inArray } from 'drizzle-orm';
import { logger } from './logger';

let configured = false;

/**
 * Notifiche web push (PWA) via VAPID. Configurazione lazy: se le chiavi
 * mancano, l'invio viene semplicemente saltato (le push native restano attive).
 */
export function isWebPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ensureConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:assistenza@familysync.it',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export interface WebPushSendResult {
  ok: boolean;
  /** Codice errore stabile per il client (solo se ok=false). */
  code?: 'NOT_CONFIGURED' | 'EXPIRED' | 'SEND_FAILED';
  /** Status HTTP restituito dal servizio push, se disponibile. */
  status?: number;
}

/**
 * Invia una notifica di prova a UNA sottoscrizione e riporta l'esito
 * (a differenza dell'invio massivo, qui l'errore va mostrato all'utente).
 * Le sottoscrizioni scadute (404/410) vengono rimosse dal database.
 */
export async function sendWebPushToSingleSubscription(
  sub: WebPushTarget,
  payload: { title: string; body: string; data?: Record<string, any> },
): Promise<WebPushSendResult> {
  if (!ensureConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  });
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: 300 },
    );
    return { ok: true };
  } catch (err: any) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) {
      try {
        await db
          .delete(webPushSubscriptions)
          .where(inArray(webPushSubscriptions.endpoint, [sub.endpoint]));
      } catch (cleanupErr) {
        logger.error('Web push cleanup failed', { error: String(cleanupErr) });
      }
      return { ok: false, code: 'EXPIRED', status };
    }
    logger.error('Web push test send failed', { status, error: String(err?.message || err) });
    return { ok: false, code: 'SEND_FAILED', status };
  }
}

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Invia una notifica a un elenco di sottoscrizioni web. Le sottoscrizioni
 * scadute (404/410) vengono rimosse dal database.
 */
export async function sendWebPushToSubscriptions(
  subs: WebPushTarget[],
  payload: { title: string; body: string; data?: Record<string, any> },
): Promise<void> {
  if (subs.length === 0 || !ensureConfigured()) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  });

  const expired: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 3600 },
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          expired.push(sub.endpoint);
        } else {
          logger.error('Web push send failed', { status, error: String(err?.message || err) });
        }
      }
    }),
  );

  if (expired.length > 0) {
    try {
      await db
        .delete(webPushSubscriptions)
        .where(inArray(webPushSubscriptions.endpoint, expired));
    } catch (err) {
      logger.error('Web push cleanup failed', { error: String(err) });
    }
  }
}
