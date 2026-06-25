import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_STORAGE_KEY = "@family_sync_auth";

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, refreshUser, logout } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setResentMessage(null);
    try {
      const updated = await refreshUser();
      if (updated && !updated.emailVerified) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("Non ancora verificata", "La tua email non risulta ancora verificata. Controlla la tua casella di posta e clicca il link.");
      } else if (updated?.emailVerified) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setChecking(false);
    }
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      handleCheck();
    }, [handleCheck])
  );

  const handleResend = useCallback(async () => {
    setResending(true);
    setResentMessage(null);
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const token = stored ? JSON.parse(stored).accessToken : null;
      const url = new URL("/api/auth/resend-verification-email", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResentMessage("Email di verifica inviata. Controlla la tua casella di posta.");
      } else {
        setResentMessage("Impossibile inviare l'email. Riprova tra poco.");
      }
    } catch {
      setResentMessage("Errore di connessione. Riprova tra poco.");
    } finally {
      setResending(false);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="mail-unread-outline" size={56} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Verifica la tua email</Text>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Abbiamo inviato un link di verifica a:
        </Text>
        <Text style={[styles.email, { color: colors.text }]}>{user?.email}</Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Apri l'email e clicca sul link per attivare il tuo account. Finché non verifichi, le funzioni dell'app restano bloccate.
        </Text>

        {resentMessage && (
          <Text style={[styles.resentMessage, { color: colors.primary }]}>{resentMessage}</Text>
        )}

        <Pressable
          onPress={handleCheck}
          disabled={checking}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: checking ? 0.6 : 1 }]}
        >
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Ho verificato, continua</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={resending}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          {resending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Reinvia email di verifica</Text>
          )}
        </Pressable>
      </View>

      <Pressable onPress={logout} style={styles.logoutButton}>
        <Text style={[styles.logoutText, { color: colors.textSecondary }]}>Esci</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  email: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  resentMessage: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginBottom: 20,
  },
  primaryButton: {
    width: "100%",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryButton: {
    width: "100%",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  logoutButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
