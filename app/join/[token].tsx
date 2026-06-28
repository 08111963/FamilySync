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
  | "create_password"
  | "confirm_accept"
  | "login_required"
  | "email_mismatch"
  | "success"
  | "expired"
  | "used"
  | "not_found"
  | "error";

interface InviteInfo {
  status: "valid" | "expired" | "accepted";
  email: string;
  invitedName: string | null;
  familyName: string | null;
  userExists: boolean;
}

export default function JoinFamilyScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isAuthenticated, isLoading: authLoading, user, applySession, logout } = useAuth();
  const { switchFamily } = useFamily();
  const qc = useQueryClient();

  const [screen, setScreen] = useState<Screen>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [familyName, setFamilyName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const loadInvite = useCallback(async () => {
    if (!token) {
      setScreen("not_found");
      return;
    }
    setScreen("loading");
    try {
      const url = new URL(`/api/invites/${token}`, getApiUrl());
      const res = await globalThis.fetch(url.toString());
      const data = await res.json();

      if (res.status === 404 || data.status === "not_found") {
        setScreen("not_found");
        return;
      }

      const info: InviteInfo = {
        status: data.status,
        email: data.email,
        invitedName: data.invitedName ?? null,
        familyName: data.familyName ?? null,
        userExists: !!data.userExists,
      };
      setInvite(info);
      setName(info.invitedName || "");
      setFamilyName(info.familyName || "la famiglia");

      if (info.status === "expired") {
        setScreen("expired");
        return;
      }
      if (info.status === "accepted") {
        setScreen("used");
        return;
      }

      // status valido
      if (!isAuthenticated) {
        setScreen(info.userExists ? "login_required" : "create_password");
        return;
      }

      // utente loggato
      const sameEmail = user?.email?.toLowerCase() === info.email.toLowerCase();
      if (sameEmail) {
        setScreen("confirm_accept");
      } else {
        setScreen("email_mismatch");
      }
    } catch {
      setScreen("error");
      setErrorMessage("Impossibile caricare l'invito. Verifica la connessione.");
    }
  }, [token, isAuthenticated, user]);

  useEffect(() => {
    if (authLoading) return;
    loadInvite();
  }, [authLoading, loadInvite]);

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

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return "La password deve avere almeno 8 caratteri";
    if (!/[a-z]/.test(pw)) return "Serve almeno una lettera minuscola";
    if (!/[A-Z]/.test(pw)) return "Serve almeno una lettera maiuscola";
    if (!/[0-9]/.test(pw)) return "Serve almeno un numero";
    return null;
  };

  const handleCreateAccount = async () => {
    setFormError(null);
    const pwErr = validatePassword(password);
    if (pwErr) {
      setFormError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Le password non coincidono");
      return;
    }
    setSubmitting(true);
    try {
      const url = new URL(`/api/invites/${token}/accept`, getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code;
        if (code === "USER_EXISTS") {
          setScreen("login_required");
        } else if (code === "INVITE_EXPIRED") {
          setScreen("expired");
        } else if (code === "ALREADY_ACCEPTED") {
          setScreen("used");
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
      const res = await apiRequest("POST", `/api/families/join/${token}`, {});
      const data = await res.json();
      invalidateFamily(data.family?.id);
      setFamilyName(data.family?.name || familyName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen("success");
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      if (msg.includes("EMAIL_MISMATCH") || msg.includes("403")) {
        setScreen("email_mismatch");
      } else if (msg.includes("INVITE_EXPIRED")) {
        setScreen("expired");
      } else if (msg.includes("ALREADY_ACCEPTED") || msg.includes("409")) {
        setScreen("used");
      } else {
        setFormError("Impossibile accettare l'invito. Riprova.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goHome = () => router.replace("/(tabs)");
  const goLogin = () =>
    router.replace({ pathname: "/login", params: { redirect: `/join/${token}` } });
  const handleLogoutAndLogin = async () => {
    await logout();
    goLogin();
  };

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

        {screen === "create_password" && invite && (
          <View>
            <View style={styles.center}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="people" size={56} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Unisciti a {familyName}</Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                Crea la tua password per l'account {invite.email}
              </Text>
            </View>

            <View style={{ marginTop: 24, gap: 16 }}>
              <Input label="Nome" placeholder="Il tuo nome" value={name} onChangeText={setName} autoCapitalize="words" testID="input-name" />
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
              {formError && <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>}
              <Button
                title={submitting ? "Creazione..." : "Crea account ed entra"}
                onPress={handleCreateAccount}
                disabled={submitting}
                testID="create-account-button"
              />
            </View>
          </View>
        )}

        {screen === "confirm_accept" && invite &&
          renderIconState(
            "people",
            colors.primary,
            `Unisciti a ${familyName}`,
            `Sei stato invitato come ${user?.email}. Vuoi entrare in questa famiglia?`,
            { label: submitting ? "Accettazione..." : "Accetta invito", onPress: handleAcceptAsUser },
            { label: "Annulla", onPress: goHome }
          )}

        {screen === "confirm_accept" && formError && (
          <Text style={[styles.errorText, { color: colors.error, marginTop: 12 }]}>{formError}</Text>
        )}

        {screen === "login_required" && invite &&
          renderIconState(
            "log-in",
            colors.primary,
            "Accedi per continuare",
            `Esiste già un account per ${invite.email}. Accedi per accettare l'invito.`,
            { label: "Accedi", onPress: goLogin }
          )}

        {screen === "email_mismatch" && invite &&
          renderIconState(
            "alert-circle",
            colors.error,
            "Email diversa",
            `Questo invito è per ${invite.email}, ma hai effettuato l'accesso con un altro account. Accedi con l'email corretta per accettare.`,
            { label: "Cambia account", onPress: handleLogoutAndLogin },
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "success" &&
          renderIconState(
            "checkmark-circle",
            colors.success,
            "Benvenuto!",
            `Sei entrato in ${familyName}`,
            { label: "Vai alla Home", onPress: goHome }
          )}

        {screen === "expired" &&
          renderIconState(
            "time",
            colors.error,
            "Invito scaduto",
            "Questo invito non è più valido. Chiedi alla famiglia di inviarne uno nuovo.",
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "used" &&
          renderIconState(
            "checkmark-done",
            colors.textSecondary,
            "Invito già usato",
            "Questo invito è già stato accettato.",
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "not_found" &&
          renderIconState(
            "close-circle",
            colors.error,
            "Invito non valido",
            "Il link di invito non è corretto o non esiste.",
            { label: "Torna alla Home", onPress: goHome }
          )}

        {screen === "error" &&
          renderIconState(
            "cloud-offline",
            colors.error,
            "Errore",
            errorMessage || "Si è verificato un errore.",
            { label: "Riprova", onPress: loadInvite }
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
