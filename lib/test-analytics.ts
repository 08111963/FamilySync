import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";

/**
 * ANALYTICS INTERNA TEMPORANEA (periodo di test).
 *
 * Tracciamento leggero fire-and-forget: se il flag lato server è spento
 * (ENABLE_TEST_ANALYTICS=false) l'endpoint risponde 404 e qui non succede
 * nulla. Gli errori sono SEMPRE silenziosi: l'app non deve mai rompersi o
 * rallentare per colpa dell'analytics.
 *
 * NON inviare mai contenuti personali (testi, titoli, importi, prompt, email).
 */

const AUTH_STORAGE_KEY = "@family_sync_auth";

export type TestAnalyticsEventName =
  | "app_open"
  | "login_success"
  | "screen_view"
  | "feature_used"
  | "api_error"
  | "premium_status_checked"
  | "ai_toggle_changed"
  | "delete_account_opened"
  | "legal_page_opened"
  | "dictation_error"
  | "paywall_viewed"
  | "plan_selected"
  | "purchase_started"
  | "purchase_completed"
  | "purchase_cancelled"
  | "purchase_failed"
  | "purchase_restored";

type Metadata = Record<string, string | number | boolean>;

const appVersion: string = Constants.expoConfig?.version ?? "unknown";

// Se il server risponde 404 (flag spento) smettiamo di inviare per la sessione.
let disabledForSession = false;

async function getToken(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) return JSON.parse(stored).accessToken || null;
  } catch {}
  return null;
}

export function trackEvent(
  eventName: TestAnalyticsEventName,
  options?: { screen?: string; familyId?: string; metadata?: Metadata },
): void {
  if (disabledForSession) return;
  (async () => {
    try {
      const token = await getToken();
      if (!token) return; // l'endpoint richiede autenticazione
      const url = new URL("/api/test-analytics/events", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventName,
          platform: Platform.OS,
          appVersion,
          screen: options?.screen,
          familyId: options?.familyId,
          metadata: options?.metadata,
        }),
      });
      if (res.status === 404) disabledForSession = true;
    } catch {
      // Silenzioso by design.
    }
  })().catch(() => {});
}

export function trackScreenView(pathname: string): void {
  trackEvent("screen_view", { screen: pathname.slice(0, 100) });
  // Eventi dedicati richiesti per pagine sensibili (solo il fatto che sono aperte).
  if (pathname.startsWith("/delete-account")) trackEvent("delete_account_opened", { screen: pathname });
  if (pathname.startsWith("/legal")) trackEvent("legal_page_opened", { screen: pathname.slice(0, 100) });
}

export function trackFeatureUsed(feature: string, familyId?: string): void {
  trackEvent("feature_used", { familyId, metadata: { feature: feature.slice(0, 100) } });
}

export function trackApiError(route: string, status: number): void {
  trackEvent("api_error", { metadata: { route: route.slice(0, 100), status } });
}
