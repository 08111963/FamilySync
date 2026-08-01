import { useState } from "react";
import { StyleSheet, Text, View, Platform, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";
import { getNativePushToken, isNativePushSupported } from "@/hooks/usePushNotifications";

type TestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const TROUBLESHOOT_HINTS =
  "Se la notifica non compare entro qualche secondo: controlla che le notifiche dell'app siano attive nelle impostazioni del telefono, che il risparmio batteria non blocchi l'app e che \u201cNon disturbare\u201d sia spento.";

/**
 * Pulsante "Invia notifica di prova" — SOLO app nativa (build store) e SOLO
 * proprietario dell'app. La visibilità è decisa dal server (stesso endpoint
 * /access owner-gated della prova web): per tutti gli altri la query fallisce
 * (404) e il pulsante non compare. Invia una push nativa al SOLO dispositivo
 * corrente. In Expo Go non compare (i token push non sono supportati).
 */
export function NativePushTestButton() {
  const { colors } = useTheme();
  const [state, setState] = useState<TestState>({ kind: "idle" });

  const supported = isNativePushSupported();

  const { data: access } = useQuery<{ ok: boolean }>({
    queryKey: ["/api/notifications/web/test/access"],
    enabled: supported,
    retry: false,
  });

  if (!supported || !access?.ok) return null;

  const sendTest = async () => {
    setState({ kind: "sending" });
    try {
      const token = await getNativePushToken();
      if (!token) {
        setState({
          kind: "error",
          message:
            "Nessun token push trovato per questo dispositivo. Controlla che il permesso notifiche sia concesso nelle impostazioni e riapri l'app.",
        });
        return;
      }

      await apiRequest("POST", "/api/notifications/native/test", { token });
      setState({ kind: "sent" });
    } catch (error: any) {
      // apiRequest allega il body strutturato del server: usa il suo messaggio.
      const message =
        error?.body?.error?.message || "Invio non riuscito. Riprova più tardi.";
      setState({ kind: "error", message });
    }
  };

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: "#6C5CE720" }]}>
          <Ionicons name="notifications-circle-outline" size={24} color="#6C5CE7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Notifica di prova</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Riservato: verifica le push native su questo dispositivo
          </Text>
        </View>
        <Pressable
          onPress={sendTest}
          disabled={state.kind === "sending"}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed || state.kind === "sending" ? 0.8 : 1 },
          ]}
          testID="native-push-test-send"
        >
          {state.kind === "sending" ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>Invia</Text>
          )}
        </Pressable>
      </View>
      {state.kind === "sent" && (
        <Text style={[styles.result, { color: colors.success ?? colors.primary }]} testID="native-push-test-result">
          Notifica inviata! {TROUBLESHOOT_HINTS}
        </Text>
      )}
      {state.kind === "error" && (
        <Text style={[styles.result, { color: colors.error }]} testID="native-push-test-result">
          {state.message}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  result: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 10,
  },
});
