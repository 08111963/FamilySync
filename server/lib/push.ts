import { db } from '../db';
import { pushTokens, webPushSubscriptions, familyMembers } from '../../shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { logger } from './logger';
import { sendWebPushToSubscriptions } from './web-push';

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

async function sendToTokens(
  validTokens: string[],
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<void> {
  if (validTokens.length === 0) return;

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
    return;
  }

  const result: any = await res.json();
  const tickets = Array.isArray(result?.data) ? result.data : [];

  const invalidTokens: string[] = [];
  tickets.forEach((ticket: any, i: number) => {
    if (
      ticket?.status === 'error' &&
      ticket?.details?.error === 'DeviceNotRegistered'
    ) {
      invalidTokens.push(validTokens[i]);
    }
  });

  if (invalidTokens.length > 0) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
  }
}

/**
 * Invia una notifica push a tutti i membri di una famiglia,
 * escludendo l'autore dell'azione ed eventuali utenti esclusi (es. blocchi).
 * Fire-and-forget: gli errori vengono solo loggati.
 */
export async function sendPushToFamily(
  familyId: string,
  payload: { title: string; body: string; data?: Record<string, any> },
  opts?: { excludeUserIds?: string[] | Set<string> }
): Promise<void> {
  try {
    const excluded = new Set(opts?.excludeUserIds ?? []);
    const members = await db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));

    const targetIds = members
      .map((m) => m.userId)
      .filter((id) => !excluded.has(id));
    if (targetIds.length === 0) return;

    const [tokens, webSubs] = await Promise.all([
      db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, targetIds)),
      db
        .select({
          endpoint: webPushSubscriptions.endpoint,
          p256dh: webPushSubscriptions.p256dh,
          auth: webPushSubscriptions.auth,
        })
        .from(webPushSubscriptions)
        .where(inArray(webPushSubscriptions.userId, targetIds)),
    ]);

    const validTokens = tokens
      .map((t) => t.token)
      .filter((t) => isExpoPushToken(t));

    await Promise.all([
      sendToTokens(validTokens, payload),
      sendWebPushToSubscriptions(webSubs, payload),
    ]);
  } catch (error) {
    logger.error('sendPushToFamily error', { error: String(error) });
  }
}

/**
 * Invia una notifica push a tutti i dispositivi registrati di un utente.
 * Fire-and-forget: non blocca la richiesta chiamante.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<void> {
  try {
    const [tokens, webSubs] = await Promise.all([
      db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId)),
      db
        .select({
          endpoint: webPushSubscriptions.endpoint,
          p256dh: webPushSubscriptions.p256dh,
          auth: webPushSubscriptions.auth,
        })
        .from(webPushSubscriptions)
        .where(eq(webPushSubscriptions.userId, userId)),
    ]);

    const validTokens = tokens
      .map((t) => t.token)
      .filter((t) => isExpoPushToken(t));

    await Promise.all([
      sendToTokens(validTokens, payload),
      sendWebPushToSubscriptions(webSubs, payload),
    ]);
  } catch (error) {
    logger.error('sendPushToUser error', { error: String(error) });
  }
}
