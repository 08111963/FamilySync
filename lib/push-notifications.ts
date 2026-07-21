/**
 * Registrazione notifiche push (Expo Push).
 *
 * Funziona SOLO nell'app installata da store (build nativa):
 * - su web non esistono push native → no-op
 * - in Expo Go (SDK 53+) getExpoPushTokenAsync crasha → no-op
 *   (vedi Constants.executionEnvironment === 'storeClient')
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getApiUrl } from '@/lib/query-client';

export const PUSH_TOKEN_STORAGE_KEY = '@family_sync_push_token';

/** True solo dove le push remote possono funzionare (build nativa, non web/Expo Go). */
export function isPushSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return true;
}

interface StoredPushRegistration {
  token: string;
  userId: string;
}

/** Legge la registrazione salvata (gestendo il vecchio formato stringa-token). */
export async function getStoredPushRegistration(): Promise<StoredPushRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as StoredPushRegistration;
      return parsed?.token ? parsed : null;
    }
    return { token: raw, userId: '' };
  } catch {
    return null;
  }
}

/**
 * Chiede il permesso, ottiene il token Expo e lo registra sul backend.
 * Fire-and-forget: non lancia mai, logga soltanto.
 */
export async function registerForPushNotifications(accessToken: string, userId: string): Promise<void> {
  try {
    if (!isPushSupported()) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifiche FamilySync',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.easConfig?.projectId as string | undefined) ??
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
    if (!projectId) {
      console.warn('Push: projectId EAS non trovato, registrazione saltata');
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) return;

    // Salta solo se lo STESSO token è già registrato per lo STESSO utente:
    // al cambio account il token va ri-associato al nuovo utente sul backend.
    const stored = await getStoredPushRegistration();
    if (stored && stored.token === token && stored.userId === userId) return;

    const url = new URL('/api/notifications/register', getApiUrl());
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });

    if (res.ok) {
      await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, JSON.stringify({ token, userId }));
    }
  } catch (error) {
    console.warn('Registrazione push non riuscita:', error);
  }
}
