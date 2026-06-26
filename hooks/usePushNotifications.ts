import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";

export const PUSH_TOKEN_STORAGE_KEY = "@family_sync_push_token";

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

async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
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
