import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!currentPassword || !newPassword) {
      setError("Compila tutti i campi");
      return;
    }
    if (newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("La nuova password deve avere almeno 8 caratteri, una maiuscola, una minuscola e un numero");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le due password non coincidono");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.includes("400")
          ? "La password attuale non è corretta"
          : "Errore durante il cambio password. Riprova.";
      setError(message);
      console.error("Change password error:", err);
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Cambia Password</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {success ? (
          <View>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.iconCircle, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                </View>
                <Text style={[styles.heading, { color: colors.text }]}>Password aggiornata</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  La prossima volta accedi con la nuova password.
                </Text>
              </View>
            </Card>
            <Button title="Fatto" onPress={() => router.back()} style={{ marginTop: 20 }} />
          </View>
        ) : (
          <View>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Scegli una nuova password personale per il tuo accesso.
            </Text>

            <View style={styles.field}>
              <Input
                label="Password attuale"
                placeholder="La password con cui sei entrato"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Input
                label="Nuova password"
                placeholder="Almeno 8 caratteri"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Usa almeno 8 caratteri, con una maiuscola, una minuscola e un numero.
              </Text>
            </View>

            <View style={styles.field}>
              <Input
                label="Conferma nuova password"
                placeholder="Ripeti la nuova password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

            <Button
              title={loading ? "Salvataggio..." : "Salva nuova password"}
              onPress={handleSubmit}
              disabled={loading}
              style={{ marginTop: 8 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 40 },
  content: { flex: 1, paddingHorizontal: 20 },
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20, lineHeight: 20 },
  field: { marginBottom: 20 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  iconCircle: { width: 68, height: 68, borderRadius: 34, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
