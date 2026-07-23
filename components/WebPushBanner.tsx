import { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/hooks/useTheme";
import {
  isWebPushSupported,
  getWebNotificationPermission,
  registerWebPush,
} from "@/hooks/usePushNotifications";

const DISMISS_KEY = "@family_sync_web_push_banner_dismissed";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as any).standalone === true
  );
}

type BannerState =
  | "hidden"
  | "ask"          // supportato, permesso non ancora chiesto
  | "ios_install"  // iPhone/iPad da Safari: serve aggiungere alla Home
  | "denied";      // permesso rifiutato nelle impostazioni del browser

/**
 * Banner (solo web) per attivare le notifiche push del browser.
 * La richiesta di permesso DEVE partire da un tocco dell'utente:
 * i browser bloccano le richieste automatiche al caricamento.
 */
export function WebPushBanner() {
  const { colors } = useTheme();
  const [state, setState] = useState<BannerState>("hidden");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    (async () => {
      const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
      if (dismissed === "1") return;

      if (!isWebPushSupported()) {
        // Su iPhone/iPad le notifiche web funzionano solo con l'app
        // aggiunta alla schermata Home (iOS 16.4+).
        if (isIos() && !isStandalone()) setState("ios_install");
        return;
      }
      const permission = getWebNotificationPermission();
      if (permission === "default") setState("ask");
      else if (permission === "denied") setState("denied");
      else if (permission === "granted") {
        // Già concesso: assicura la sottoscrizione in silenzio.
        void registerWebPush(false);
      }
    })();
  }, []);

  if (state === "hidden") return null;

  const dismiss = async () => {
    setState("hidden");
    try {
      await AsyncStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const activate = async () => {
    setBusy(true);
    try {
      const ok = await registerWebPush(true);
      if (ok) {
        setDone(true);
        setTimeout(() => setState("hidden"), 2500);
      } else if (getWebNotificationPermission() === "denied") {
        setState("denied");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons
        name={done ? "checkmark-circle" : "notifications-outline"}
        size={22}
        color={done ? colors.success ?? colors.primary : colors.primary}
      />
      <View style={{ flex: 1, gap: 2 }}>
        {done ? (
          <Text style={[styles.title, { color: colors.text }]}>Notifiche attivate!</Text>
        ) : state === "ask" ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Attiva le notifiche</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Ricevi avvisi per chat, bollette e faccende anche ad app chiusa.
            </Text>
          </>
        ) : state === "ios_install" ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Notifiche su iPhone</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Per riceverle, apri FamilySync dall'icona sulla schermata Home
              (Condividi → "Aggiungi a Home", serve iOS 16.4 o superiore).
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Notifiche bloccate</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Consenti le notifiche per questo sito nelle impostazioni del browser.
            </Text>
          </>
        )}
      </View>
      {state === "ask" && !done && (
        <Pressable
          onPress={activate}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed || busy ? 0.8 : 1 },
          ]}
          testID="web-push-activate"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>Attiva</Text>
          )}
        </Pressable>
      )}
      {!done && (
        <Pressable onPress={dismiss} hitSlop={8} testID="web-push-dismiss">
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
