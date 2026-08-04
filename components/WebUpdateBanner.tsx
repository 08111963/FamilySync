import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";

// Ogni quanto ricontrollare la versione del server (oltre al ritorno in foreground).
const POLL_INTERVAL_MS = 5 * 60 * 1000;

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch("/build-version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === "string" && data.version ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Versione della build ATTUALMENTE in esecuzione, derivata dai percorsi dei
 * bundle JS hashati caricati dalla pagina (/_expo/static/js/...). DEVE usare
 * la stessa logica di computeWebBuildVersion in server/index.ts, così il
 * confronto rileva subito un'app già vecchia all'apertura.
 * Restituisce null in dev (Metro) dove non esistono bundle statici.
 */
async function computeRunningVersion(): Promise<string | null> {
  try {
    if (typeof document === "undefined" || typeof crypto === "undefined" || !crypto.subtle) {
      return null;
    }
    const paths = new Set<string>();
    for (const script of Array.from(document.scripts)) {
      const src = script.getAttribute("src") ?? "";
      const match = src.match(/\/_expo\/static\/js\/[^"' >]+\.js/);
      if (match) paths.add(match[0]);
    }
    if (paths.size === 0) return null;
    const canonical = Array.from(paths).sort().join("|");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Banner (solo web/PWA) che avvisa quando il server ha pubblicato una build
 * più recente di quella in esecuzione. Alla prima apertura memorizza la
 * versione corrente, poi ricontrolla periodicamente e al ritorno in
 * foreground: se cambia, propone un ricaricamento completo della pagina.
 */
export function WebUpdateBanner() {
  const { colors } = useTheme();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const runningVersion = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    let cancelled = false;

    // Se il controllo fallisce (es. rete assente per un attimo mentre il
    // telefono ripristina la pagina), riprova a breve invece di aspettare
    // il prossimo giro di polling: altrimenti una pagina vecchia resta
    // senza avviso per minuti.
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const checkWithRetry = async () => {
      if (runningVersion.current === null) {
        runningVersion.current = await computeRunningVersion();
        if (runningVersion.current === null) return;
      }
      const serverVersion = await fetchServerVersion();
      if (cancelled) return;
      if (!serverVersion) {
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void checkWithRetry();
          }, 10_000);
        }
        return;
      }
      if (serverVersion !== runningVersion.current) {
        setUpdateAvailable(true);
      }
    };

    void checkWithRetry();
    const interval = setInterval(checkWithRetry, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void checkWithRetry();
      }
    };
    // pageshow con persisted=true = pagina ripristinata dalla back/forward
    // cache del browser (frequente su Chrome Android): i timer erano fermi,
    // quindi va rifatto subito il confronto di versione.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void checkWithRetry();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", onPageShow as EventListener);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", onPageShow as EventListener);
      }
    };
  }, []);

  if (Platform.OS !== "web" || !updateAvailable || dismissed) return null;

  const reload = () => {
    try {
      // Chiede al service worker (se presente) di attivare subito la nuova
      // versione, poi ricarica la pagina per caricare i bundle aggiornati.
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
      }
    } catch {}
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="refresh-circle-outline" size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: colors.text }]}>Nuova versione disponibile</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Aggiorna per usare l'ultima versione di FamilySync.
          </Text>
        </View>
        <Pressable
          onPress={reload}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="web-update-reload"
        >
          <Text style={styles.buttonText}>Aggiorna</Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} testID="web-update-dismiss">
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 560,
    width: "90%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
