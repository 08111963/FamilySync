import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

/**
 * Accesso "dispositivo bambino": schermata pubblica in cui il bambino inserisce
 * il codice generato dal genitore ed entra SENZA email/password.
 */
export default function ChildLoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { applySession } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const canSubmit = cleaned.length >= 6 && !loading;

  const handleActivate = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/child-access/activate", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleaned }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message || "Codice non valido o scaduto. Chiedi ai tuoi genitori un nuovo codice.");
        return;
      }
      await applySession(body.user, body.accessToken, body.refreshToken);
      router.replace("/");
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  // Mostra il codice formattato "ABCD-EFGH" mentre il bambino digita.
  const displayValue = cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}` : cleaned;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12} testID="child-login-back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="happy-outline" size={48} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Ciao! Hai un codice?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Chiedi ai tuoi genitori il codice di accesso e scrivilo qui sotto per entrare nella tua famiglia.
        </Text>

        <TextInput
          style={[
            styles.codeInput,
            { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border, color: colors.text },
          ]}
          placeholder="ABCD-EFGH"
          placeholderTextColor={colors.textSecondary}
          value={displayValue}
          onChangeText={(t) => {
            setCode(t);
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          keyboardAppearance={isDark ? "dark" : "light"}
          testID="child-code-input"
        />

        {error && (
          <Text style={[styles.errorText, { color: colors.error }]} testID="child-login-error">
            {error}
          </Text>
        )}

        <Pressable
          onPress={handleActivate}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: colors.primary, opacity: !canSubmit ? 0.5 : pressed ? 0.8 : 1 },
          ]}
          testID="child-login-submit"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
              <Text style={styles.submitText}>Entra</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Il codice funziona una sola volta e scade dopo 48 ore. Se non funziona, chiedi ai tuoi genitori di generarne uno nuovo dal tab Famiglia.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },
  backButton: { alignSelf: "flex-start", marginBottom: 16 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 32, lineHeight: 22 },
  codeInput: {
    width: "100%",
    maxWidth: 320,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 4,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 12, textAlign: "center" },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    maxWidth: 320,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
  },
  submitText: { color: "#FFFFFF", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 24, lineHeight: 19 },
});
