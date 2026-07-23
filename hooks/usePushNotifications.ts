import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";

export const PUSH_TOKEN_STORAGE_KEY = "@family_sync_push_token";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Mostra subito una notifica locale (funziona in Expo Go).
 */
export async function presentLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) return;
    await Notifications.scheduleNotificationAsync({
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

/**
 * Registra le notifiche web push (browser): service worker + sottoscrizione
 * VAPID, poi invia la sottoscrizione al server. Ritorna true se registrata.
 * Al cambio account il server riassocia l'endpoint al nuovo utente (rebind).
 */
async function registerWebPush(): Promise<boolean> {
  try {
    if (Platform.OS !== "web") return false;
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return false;
    }

    // Chiave pubblica VAPID dal server (503 se non configurata).
    const keyRes = await apiRequest("GET", "/api/notifications/web/public-key");
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return false;

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

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Predefinito",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenResponse.data ?? null;
  } catch {
    return null;
  }
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
        await registerWebPush();
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
