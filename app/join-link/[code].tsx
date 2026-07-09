import { useState, useEffect, useCallback } from "react";
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Platform, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";

type Screen =
  | "loading"
  | "create_account"
  | "confirm_accept"
  | "success"
  | "full"
  | "not_found"
  | "error";

export default function JoinLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isAuthenticated, isLoading: authLoading, user, applySession } = useAuth();
  const { switchFamily } = useFamily();
  const qc = useQueryClient();

  const [screen, setScreen] = useState<Screen>("loading");
  const [familyName, setFamilyName] = useState<string>("la famiglia");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const loadLink = useCallback(async () => {
    if (!code) {
      setScreen("not_found");
      return;
    }
    setScreen("loading");
    try {
      const url = new URL(`/api/join-link/${code}`, getApiUrl());
      const res = await globalThis.fetch(url.toString());
      const data = await res.json();

      if (res.status === 404 || data.status === "not_found") {
        setScreen("not_found");
        return;
      }

      setFamilyName(data.familyName || "la famiglia");

      if (data.status === "full" || data.memberLimitReached) {
        setScreen("full");
        return;
      }

      // Utente già loggato: entra direttamente con l'account corrente.
      if (isAuthenticated) {
        setScreen("confirm_accept");
      } else {
        setScreen("create_account");
      }
    } catch {
      setScreen("error");
      setErrorMessage("Impossibile caricare l'invito. Verifica la connessione.");
    }
  }, [code, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    loadLink();
  }, [authLoading, loadLink]);

  const invalidateFamily = (familyId?: string) => {
    qc.invalidateQueries({ queryKey: ["/api/families"] });
    if (familyId) {
      switchFamily(familyId);
      qc.invalidateQueries({ queryKey: ["/api/families", familyId] });
      qc.invalidateQueries({ queryKey: ["/api/calendar", familyId] });
      qc.invalidateQueries({ queryKey: ["/api/shopping", familyId, "lists"] });
      qc.invalidateQueries({ queryKey: ["/api/chores", familyId] });
    }
  };

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return "La password deve avere almeno 8 caratteri";
    if (!/[a-z]/.test(pw)) return "Serve almeno una lettera minuscola";
    if (!/[A-Z]/.test(pw)) return "Serve almeno una lettera maiuscola";
    if (!/[0-9]/.test(pw)) return "Serve almeno un numero";
    return null;
  };

  const handleCreateAccount = async () => {
    setFormError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      setFormError("Inserisci un indirizzo email valido");
      return;
    }
    if (name.trim().length < 2) {
      setFormError("Inserisci il tuo nome");
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setFormError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Le password non coincidono");
      return;
    }
    if (!acceptedTerms) {
      setFormError("Devi accettare i Termini di servizio e la Privacy Policy");
      return;
    }
    setSubmitting(true);
    try {
      const url = new URL(`/api/join-link/${code}/accept`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, name: name.trim(), password, acceptedTerms }),
      });
      const data = await res.json();
      if (!res.ok) {
        const c = data?.error?.code;
        if (c === "USER_EXISTS") {
          setFormError("Esiste già un account con questa email. Accedi con quell'account per entrare nella famiglia.");
        } else if (c === "MEMBER_LIMIT_REACHED") {
          setScreen("full");
        } else if (c === "TERMS_REQUIRED") {
          setFormError("Devi accettare i Termini di servizio e la Privacy Policy");
        } else if (c === "NOT_FOUND") {
          setScreen("not_found");
        } else {
          setFormError(data?.error?.message || "Errore nella creazione dell'account");
        }
        return;
      }
      await applySession(data.user, data.accessToken, data.refreshToken);
      invalidateFamily(data.family?.id);
      setFamilyName(data.family?.name || familyName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen("success");
    } catch {
      setFormError("Errore di connessione. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptAsUser = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiRequest("POST", `/api/families/join-link/${code}`, {});
      const data = await res.json();
      invalidateFamily(data.family?.id);
      setFamilyName(data.family?.name || familyName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen("success");
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      if (msg.includes("ALREADY_MEMBER") || msg.includes("409")) {
        setFormError("Fai già parte di questa famiglia.");
      } else if (msg.includes("MEMBER_LIMIT_REACHED")) {
        setScreen("full");
      } else {
        setFormError("Impossibile entrare nella famiglia. Riprova.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goHome = () => router.replace("/(tabs)");

  const renderIconState = (
    icon: keyof typeof Ionicons.glyphMap,
    tint: string,
    title: string,
    message: string,
    primary?: { label: string; onPress: () => void },
    secondary?: { label: string; onPress: () => void }
  ) => (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: tint + "20" }]}>
        <Ionicons name={icon} size={64} color={tint} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {primary && (
        <Pressable
          onPress={primary.onPress}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.buttonText}>{primary.label}</Text>
        </Pressable>
      )}
      {secondary && (
        <Pressable onPress={secondary.onPress} style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>{secondary.label}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: 40, flexGrow: 1, justifyContent: "center" }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        {screen === "loading" && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.message, { color: colors.textSecondary }]}>Caricamento invito...</Text>
          </View>
        )}

        {screen === "create_account" && (
          <View>
            <View style={styles.center}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="people" size={56} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Unisciti a {familyName}</Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                Crea il tuo account per entrare nella famiglia.
              </Text>
            </View>

            <View style={{ marginTop: 24, gap: 16 }}>
              <Input label="Nome" placeholder="Il tuo nome" value={name} onChangeText={setName} autoCapitalize="words" testID="input-name" />
              <Input
                label="Email"
                placeholder="nome@esempio.it"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="input-email"
              />
              <Input
                label="Password"
                placeholder="Almeno 8 caratteri"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                testID="input-password"
              />
              <Input
                label="Conferma password"
                placeholder="Ripeti la password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                testID="input-confirm"
              />
              <Pressable
                onPress={() => setAcceptedTerms((v) => !v)}
                style={styles.termsRow}
                testID="terms-checkbox"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: acceptedTerms ? colors.primary : colors.border },
                    acceptedTerms && { backgroundColor: colors.primary },
                  ]}
                >
                  {acceptedTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>
                <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                  Accetto i{" "}
                  <Text style={[styles.termsLink, { color: colors.primary }]} onPress={() => router.push("/legal/terms")} testID="terms-link">
                    Termini di servizio
                  </Text>{" "}
                  e la{" "}
                  <Text style={[styles.termsLink, { color: colors.primary }]} onPress={() => router.push("/legal/privacy")} testID="privacy-link">
                    Privacy Policy
                  </Text>
                </Text>
              </Pressable>
              {formError && <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>}
              <Button
                title={submitting ? "Creazione..." : "Crea account ed entra"}
                onPress={handleCreateAccount}
                disabled={submitting || !acceptedTerms}
                testID="create-account-button"
              />
            </View>
          </View>
        )}

        {screen === "confirm_accept" && (
          <>
            {renderIconState(
              "people",
              colors.primary,
              `Unisciti a ${familyName}`,
              `Vuoi entrare in questa famiglia con l'account ${user?.email}?`,
              { label: submitting ? "Accesso..." : "Entra nella famiglia", onPress: handleAcceptAsUser },
              { label: "Annulla", onPress: goHome }
            )}
            {formError && <Text style={[styles.errorText, { color: colors.error, marginTop: 12 }]}>{formError}</Text>}
          </>
        )}

        {screen === "success" &&
          renderIconState(
            "checkmark-circle",
            colors.success,
            "Benvenuto!",
            `Sei entrato in ${familyName}`,
            { label: "Vai alla Home", onPress: goHome }
          )}

        {screen === "full" &&
          renderIconState(
            "people-circle",
            colors.error,
            "Famiglia al completo",
            "Questa famiglia ha raggiunto il numero massimo di membri del piano Free. Chiedi all'admin di passare a Premium.",
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "not_found" &&
          renderIconState(
            "close-circle",
            colors.error,
            "Link non valido",
            "Il link di invito non è corretto o non esiste più.",
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "error" &&
          renderIconState(
            "cloud-offline",
            colors.error,
            "Errore",
            errorMessage || "Si è verificato un errore.",
            { label: "Riprova", onPress: loadLink }
          )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 32 },
  center: { alignItems: "center", gap: 16 },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  message: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 24 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  termsText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  termsLink: { fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginTop: 8,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkButton: { paddingVertical: 10 },
  linkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
