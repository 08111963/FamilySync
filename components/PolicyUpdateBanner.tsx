import { useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

/**
 * Banner non bloccante che avvisa gli utenti esistenti quando la Privacy
 * Policy è stata aggiornata (user.privacyPolicyUpdated dal backend).
 * "Leggi" apre /legal/privacy; entrambe le azioni ("Leggi" e la X) registrano
 * la presa visione sul server, così l'avviso non riappare.
 * È un'informativa, NON un nuovo consenso: l'app resta pienamente usabile.
 */
export function PolicyUpdateBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, isAuthenticated, accessToken, refreshUser } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated || !user?.privacyPolicyUpdated || user?.needsOnboarding || hidden) {
    return null;
  }

  const acknowledge = async () => {
    if (busy) return;
    setBusy(true);
    // Il banner sparisce subito; se la chiamata fallisce riapparirà alla
    // prossima apertura dell'app (fail-safe: meglio rimostrare che perdere l'avviso).
    setHidden(true);
    try {
      const url = new URL("/api/auth/privacy-policy-ack", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        // Aggiorna lo stato utente locale così privacyPolicyUpdated diventa false.
        await refreshUser();
      }
    } catch {
      // Silenzioso: nessun blocco per l'utente, riproverà alla prossima sessione.
    } finally {
      setBusy(false);
    }
  };

  const openPolicy = () => {
    void acknowledge();
    router.push("/legal/privacy");
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View
        style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="policy-update-banner"
      >
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            Privacy Policy aggiornata
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Abbiamo aggiornato la Privacy Policy
            {user.privacyPolicyVersion ? ` (v${user.privacyPolicyVersion})` : ""}. Nessuna azione
            richiesta: puoi leggerla quando vuoi.
          </Text>
        </View>
        <Pressable
          onPress={openPolicy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="policy-update-read"
        >
          <Text style={styles.buttonText}>Leggi</Text>
        </Pressable>
        <Pressable onPress={() => void acknowledge()} hitSlop={8} testID="policy-update-dismiss">
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
    zIndex: 999,
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
