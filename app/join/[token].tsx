import { useState, useEffect } from "react";
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";

type JoinState = "loading" | "success" | "error" | "login_required";

export default function JoinFamilyScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();

  const [state, setState] = useState<JoinState>("loading");
  const [familyName, setFamilyName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setState("login_required");
      return;
    }

    if (!token) {
      setState("error");
      setErrorMessage("Link di invito non valido");
      return;
    }

    joinFamily();
  }, [isAuthenticated, authLoading, token]);

  const joinFamily = async () => {
    setState("loading");
    try {
      const res = await apiRequest("POST", `/api/families/join/${token}`, {});
      const data = await res.json();
      setFamilyName(data.family?.name || "la famiglia");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("success");
      qc.invalidateQueries({ queryKey: ["/api/families"] });
    } catch (err: any) {
      setState("error");
      try {
        const parsed = JSON.parse(err.message?.split(": ").slice(1).join(": ") || "{}");
        if (parsed.error?.message) {
          setErrorMessage(parsed.error.message);
        } else {
          setErrorMessage("Impossibile accettare l'invito");
        }
      } catch {
        setErrorMessage("Impossibile accettare l'invito");
      }
    }
  };

  const goHome = () => {
    router.replace("/");
  };

  const goLogin = () => {
    router.replace("/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInset + 16 }]}>
      <View style={styles.content}>
        {state === "loading" && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Accettazione dell'invito in corso...
            </Text>
          </View>
        )}

        {state === "success" && (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: colors.success + "20" }]}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Benvenuto!</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Sei entrato in {familyName}
            </Text>
            <Pressable
              onPress={goHome}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.buttonText}>Vai alla Home</Text>
            </Pressable>
          </View>
        )}

        {state === "error" && (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: colors.error + "20" }]}>
              <Ionicons name="close-circle" size={64} color={colors.error} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Errore</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={goHome}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>Torna alla Home</Text>
            </Pressable>
          </View>
        )}

        {state === "login_required" && (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="person-circle" size={64} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Accedi per Continuare</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Devi effettuare l'accesso per accettare l'invito alla famiglia
            </Text>
            <Pressable
              onPress={goLogin}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.buttonText}>Accedi</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  center: { alignItems: "center", gap: 16 },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  message: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 24 },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginTop: 8,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
