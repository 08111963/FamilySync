import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

const CONFIRM_WORD = "ELIMINA";

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { logout } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!password) {
      setError("Inserisci la tua password attuale");
      return;
    }
    if (confirmation.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Digita "${CONFIRM_WORD}" per confermare`);
      return;
    }

    setLoading(true);
    try {
      await apiRequest("DELETE", "/api/auth/account", {
        password,
        confirmation: confirmation.trim().toUpperCase(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Esci automaticamente: AuthGate riportera alla schermata di benvenuto.
      await logout();
    } catch (err: any) {
      const raw = typeof err?.message === "string" ? err.message : "";
      let message = "Errore durante l'eliminazione. Riprova.";
      if (raw.includes("400") && raw.toLowerCase().includes("password")) {
        message = "La password attuale non è corretta";
      } else if (raw.includes("400")) {
        message = "Controlla la password e la conferma e riprova";
      }
      setError(message);
      console.error("Delete account error:", raw);
      setLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const canSubmit =
    !loading && password.length > 0 && confirmation.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton} testID="delete-account-close">
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Elimina account</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ borderColor: colors.error, borderWidth: 1 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Ionicons name="warning" size={24} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: colors.error }]}>
                Azione irreversibile
              </Text>
              <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                L'eliminazione dell'account è definitiva e non può essere annullata.
              </Text>
            </View>
          </View>
        </Card>

        <Text style={[styles.sectionLabel, { color: colors.text }]}>Cosa succede</Text>
        <View style={styles.bulletList}>
          {[
            "Il tuo profilo personale viene eliminato e i tuoi dati associati vengono rimossi o resi anonimi.",
            "Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, bollette e allegati) vengono eliminati.",
            "Se nella famiglia ci sono altri membri, i contenuti già condivisi restano visibili agli altri, ma senza il tuo nome.",
            "Verrai disconnesso da tutti i dispositivi.",
          ].map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <Ionicons name="ellipse" size={6} color={colors.textSecondary} style={{ marginTop: 7 }} />
              <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{line}</Text>
            </View>
          ))}
        </View>

        <Card style={{ marginTop: 4 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Ionicons name="card-outline" size={22} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>
                Hai un abbonamento Premium?
              </Text>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                L'eliminazione dell'account NON annulla l'abbonamento. Gli abbonamenti
                sono gestiti dallo store: annullalo dalle impostazioni di Apple
                (App Store) o Google (Play Store) per non essere più addebitato.
              </Text>
            </View>
          </View>
        </Card>

        <View style={[styles.field, { marginTop: 24 }]}>
          <Input
            label="Password attuale"
            placeholder="Conferma la tua identità"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            testID="delete-account-password"
          />
        </View>

        <View style={styles.field}>
          <Input
            label={`Scrivi ${CONFIRM_WORD} per confermare`}
            placeholder={CONFIRM_WORD}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-account-confirmation"
          />
        </View>

        {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          testID="delete-account-submit"
          style={({ pressed }) => [
            styles.deleteButton,
            {
              backgroundColor: canSubmit ? colors.error : colors.border,
              opacity: pressed && canSubmit ? 0.85 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={[
                styles.deleteButtonText,
                { color: canSubmit ? "#FFFFFF" : colors.textSecondary },
              ]}
            >
              Elimina definitivamente
            </Text>
          )}
        </Pressable>
        <Button
          title="Annulla"
          onPress={() => router.back()}
          variant="outline"
          style={{ marginTop: 12 }}
        />
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
  warningTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 },
  warningText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 20, marginBottom: 10 },
  bulletList: { gap: 8, marginBottom: 8 },
  bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  field: { marginBottom: 20 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  deleteButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  deleteButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
