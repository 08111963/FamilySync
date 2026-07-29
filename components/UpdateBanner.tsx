import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // ogni 5 minuti

/**
 * Banner (solo web) "Nuova versione disponibile".
 *
 * Le PWA installate dalla schermata home continuano a usare il bundle vecchio
 * anche dopo una pubblicazione. Questo componente chiede al server la versione
 * della build corrente (hash del bundle) al primo caricamento, poi ricontrolla
 * periodicamente e quando l'app torna in primo piano: se la versione è
 * cambiata, mostra un banner con un pulsante che ricarica la pagina.
 */
export function UpdateBanner() {
  const { colors } = useTheme();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    let cancelled = false;

    const fetchVersion = async (): Promise<string | null> => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        const v = typeof data?.version === "string" ? data.version : null;
        return v && v !== "unknown" ? v : null;
      } catch {
        return null; // offline o errore: nessun banner
      }
    };

    const check = async () => {
      const v = await fetchVersion();
      if (cancelled || !v) return;
      if (baselineRef.current === null) {
        baselineRef.current = v;
      } else if (v !== baselineRef.current) {
        setUpdateAvailable(true);
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    const onVisible = () => {
      const doc = globalThis as any;
      if (doc?.document?.visibilityState === "visible") check();
    };
    (globalThis as any)?.document?.addEventListener?.("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      (globalThis as any)?.document?.removeEventListener?.("visibilitychange", onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.primary }]} testID="update-banner">
      <Ionicons name="sparkles-outline" size={16} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        Nuova versione disponibile
      </Text>
      <Pressable
        onPress={() => (globalThis as any)?.location?.reload?.()}
        style={styles.button}
        testID="update-banner-reload"
      >
        <Text style={[styles.buttonText, { color: colors.primary }]}>Aggiorna</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  button: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
