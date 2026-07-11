import { db } from '../db';
import { pushTokens } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { logger } from './logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default';
}

function isExpoPushToken(token: string): boolean {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
}

export interface PushSendResult {
  /** false solo se un invio è FALLITO (rete/API); true se ok o niente da inviare. */
  ok: boolean;
  /** Quanti dispositivi hanno accettato la notifica (ticket ok). */
  delivered: number;
  /** Quanti token validi erano registrati per l'utente. */
  tokens: number;
}

/**
 * Invia una notifica push a tutti i dispositivi registrati di un utente.
 * Non lancia mai eccezioni: restituisce un esito strutturato, così chi chiama
 * può decidere se ritentare (es. lo scheduler bollette) o ignorare l'esito
 * (fire-and-forget, es. eventi calendario).
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<PushSendResult> {
  try {
    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));

    const validTokens = tokens
      .map((t) => t.token)
      .filter((t) => isExpoPushToken(t));

    if (validTokens.length === 0) return { ok: true, delivered: 0, tokens: 0 };

    const messages: PushMessage[] = validTokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      logger.error('Expo push send failed', { status: res.status });
      return { ok: false, delivered: 0, tokens: validTokens.length };
    }

    const result: any = await res.json();
    const tickets = Array.isArray(result?.data) ? result.data : [];

    let delivered = 0;
    const invalidTokens: string[] = [];
    tickets.forEach((ticket: any, i: number) => {
      if (ticket?.status === 'ok') {
        delivered++;
      } else if (
        ticket?.status === 'error' &&
        ticket?.details?.error === 'DeviceNotRegistered'
      ) {
        invalidTokens.push(validTokens[i]);
      }
    });

    if (invalidTokens.length > 0) {
      await db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
    }

    return { ok: true, delivered, tokens: validTokens.length };
  } catch (error) {
    logger.error('sendPushToUser error', { error: String(error) });
    return { ok: false, delivered: 0, tokens: 0 };
  }
}
