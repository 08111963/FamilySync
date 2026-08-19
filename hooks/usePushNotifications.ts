import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { getNotificationsModule } from "@/lib/push-notifications";

export const PUSH_TOKEN_STORAGE_KEY = "@family_sync_push_token";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Mostra subito una notifica locale nelle build native installabili.
 */
export async function presentLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    const notifications = await getNotificationsModule();
    if (!notifications) return;
    const settings = await notifications.getPermissionsAsync();
    if (!settings.granted) return;
    await notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: "default" },
      trigger: null,
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** True se questo browser supporta le notifiche web push. */
export function isWebPushSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Stato attuale del permesso notifiche nel browser. */
export function getWebNotificationPermission(): NotificationPermission | null {
  if (!isWebPushSupported()) return null;
  return Notification.permission;
}

/**
 * Registra le notifiche web push (browser): service worker + sottoscrizione
 * VAPID, poi invia la sottoscrizione al server. Ritorna true se registrata.
 * Al cambio account il server riassocia l'endpoint al nuovo utente (rebind).
 *
 * `interactive`: se true può chiedere il permesso (va chiamata da un tocco
 * dell'utente: i browser bloccano le richieste automatiche al caricamento);
 * se false si limita a ri-sottoscrivere quando il permesso è già concesso.
 */
export async function registerWebPush(interactive: boolean): Promise<boolean> {
  try {
    if (!isWebPushSupported()) return false;

    let permission = Notification.permission;
    if (permission === "default") {
      if (!interactive) return false;
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return false;

    // Chiave pubblica VAPID dal server (503 se non configurata).
    const keyRes = await apiRequest("GET", "/api/notifications/web/public-key");
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    await apiRequest("POST", "/api/notifications/web/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return true;
  } catch {
    return false;
  }
}

async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
    if (isExpoGo) return null;
    if (!Device.isDevice) return null;
    const notifications = await getNotificationsModule();
    if (!notifications) return null;

    if (Platform.OS === "android") {
      await notifications.setNotificationChannelAsync("default", {
        name: "Predefinito",
        importance: notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain) {
      const req = await notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    const tokenResponse = await notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenResponse.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Ritorna il token Expo push del dispositivo corrente (solo app nativa,
 * build store). Prova prima il token già registrato in AsyncStorage, poi
 * una nuova registrazione. Null su web, Expo Go o senza permesso.
 */
export async function getNativePushToken(): Promise<string | null> {
  if (Platform.OS === "web" || isExpoGo) return null;
  try {
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (stored) return stored;
  } catch {}
  return registerForPush();
}

/** True se questa piattaforma può ricevere push native (app installata, non Expo Go). */
export function isNativePushSupported(): boolean {
  return Platform.OS !== "web" && !isExpoGo;
}

export function usePushNotifications(enabled: boolean) {
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      registeredToken.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      if (Platform.OS === "web") {
        // Mai chiedere il permesso in automatico: solo ri-sottoscrizione
        // silenziosa se l'utente l'ha già concesso. La richiesta vera parte
        // dal banner "Attiva notifiche" (tocco dell'utente).
        await registerWebPush(false);
        return;
      }
      const token = await registerForPush();
      if (cancelled || !token || registeredToken.current === token) return;
      try {
        await apiRequest("POST", "/api/notifications/register", {
          token,
          platform: Platform.OS,
        });
        registeredToken.current = token;
        await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
