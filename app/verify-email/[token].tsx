import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  firstStringParam,
  PENDING_RETURN_TO_STORAGE_KEY,
  safeReturnTo,
} from "@/lib/safe-return-to";

type VerifyState = "loading" | "success" | "invalid" | "expired" | "network";

export default function VerifyEmailTokenScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { token, returnTo } = useLocalSearchParams<{
    token: string | string[];
    returnTo?: string | string[];
  }>();
  const returnToFromLink = safeReturnTo(firstStringParam(returnTo));

  const [state, setState] = useState<VerifyState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [storedReturnTo, setStoredReturnTo] = useState<string | undefined>();
  const runningRef = useRef(false);
  const destination = returnToFromLink || storedReturnTo;

  useEffect(() => {
    if (returnToFromLink) {
      AsyncStorage.setItem(PENDING_RETURN_TO_STORAGE_KEY, returnToFromLink).catch(() => {});
      setStoredReturnTo(undefined);
      return;
    }
    AsyncStorage.getItem(PENDING_RETURN_TO_STORAGE_KEY)
      .then((value) => setStoredReturnTo(safeReturnTo(value)))
      .catch(() => setStoredReturnTo(undefined));
  }, [returnToFromLink]);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const run = async () => {
      const tokenValue = typeof token === "string" ? token : Array.isArray(token) ? token[0] : "";
      if (!tokenValue) {
        setState("invalid");
        return;
      }
      try {
        const url = new URL("/api/auth/verify-email", getApiUrl());
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenValue }),
        });
        if (res.ok) {
          // NOTA: non chiamare refreshUser() qui. Se l'utente è loggato,
          // aggiornare subito lo stato farebbe scattare il redirect del
          // layout e la schermata di successo sparirebbe. Il refresh
          // avviene quando l'utente preme "Entra nell'app" (goNext).
          setState("success");
          return;
        }
        let code = "";
        try {
          const data = await res.json();
          code = data?.error?.code ?? "";
        } catch {
          // corpo non JSON: trattato come token non valido
        }
        setState(code === "TOKEN_EXPIRED" ? "expired" : "invalid");
      } catch {
        setState("network");
      }
    };

    run().finally(() => {
      runningRef.current = false;
    });
  }, [token, attempt]);

  const goNext = async () => {
    if (user) {
      try {
        await refreshUser();
      } catch {
        // Anche se il refresh fallisce, la verifica è avvenuta: prosegui.
      }
      await AsyncStorage.removeItem(PENDING_RETURN_TO_STORAGE_KEY).catch(() => {});
      router.replace((destination || "/(app)/(tabs)") as any);
    } else {
      router.replace(
        destination
          ? ({ pathname: "/login", params: { returnTo: destination } } as any)
          : "/login",
      );
    }
  };

  const goToResend = () => {
    if (user) {
      router.replace(
        destination
          ? ({ pathname: "/verify-email", params: { returnTo: destination } } as any)
          : "/verify-email",
      );
    } else {
      router.replace(
        destination
          ? ({ pathname: "/login", params: { returnTo: destination } } as any)
          : "/login",
      );
    }
  };

  const retry = () => {
    setState("loading");
    // Cambiare "attempt" fa ripartire l'effetto di verifica.
    setAttempt((n) => n + 1);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        {state === "loading" ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>Verifica in corso…</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Stiamo confermando il tuo indirizzo email.
            </Text>
          </>
        ) : state === "success" ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: "#22c55e20" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            </View>
            <Text style={[styles.title, { color: colors.text }]} testID="verify-success-title">
              Email verificata!
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Il tuo indirizzo è stato confermato. Ora puoi usare FamilySync.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={goNext}
              testID="verify-success-continue"
            >
              <Text style={styles.buttonText}>{user ? "Entra nell'app" : "Vai al login"}</Text>
            </Pressable>
          </>
        ) : state === "network" ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="cloud-offline-outline" size={56} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Problema di connessione</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Non siamo riusciti a contattare il server. Controlla la connessione e riprova.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={retry}
              testID="verify-retry"
            >
              <Text style={styles.buttonText}>Riprova</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: "#ef444420" }]}>
              <Ionicons name="alert-circle" size={56} color="#ef4444" />
            </View>
            <Text style={[styles.title, { color: colors.text }]} testID="verify-error-title">
              {state === "expired" ? "Link scaduto" : "Link non valido"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {state === "expired"
                ? "Questo link di verifica è scaduto. Accedi e richiedi una nuova email di verifica."
                : "Questo link di verifica non è valido o è già stato usato. Se hai già confermato, puoi semplicemente accedere."}
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={goToResend}
              testID="verify-error-action"
            >
              <Text style={styles.buttonText}>
                {user ? "Richiedi nuova email" : "Vai al login"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  button: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
