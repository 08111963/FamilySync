import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

const ROLES = [
  { value: "admin", label: "Admin", icon: "shield-checkmark" as const },
  { value: "adult", label: "Adulto", icon: "person" as const },
  { value: "teen", label: "Adolescente", icon: "school" as const },
  { value: "child", label: "Bambino/a", icon: "happy" as const },
];

type Role = "admin" | "adult" | "teen" | "child";

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("adult");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleInvite = async () => {
    if (!currentFamily) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      setError("Inserisci un indirizzo email valido");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await apiRequest("POST", `/api/families/${currentFamily.id}/invite`, {
        email: trimmedEmail,
        invitedName: name.trim() || undefined,
        role,
      });
      setSentTo(trimmedEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      let friendly = "Errore nell'invio dell'invito. Riprova.";
      if (msg.includes("409") || msg.includes("ALREADY_MEMBER")) {
        friendly = "Questa persona fa già parte della famiglia.";
      } else if (msg.includes("EMAIL_NOT_CONFIGURED") || msg.includes("503")) {
        friendly = "Il servizio email non è configurato. Contatta l'assistenza.";
      } else if (msg.includes("EMAIL_SEND_FAILED") || msg.includes("502")) {
        friendly = "Non siamo riusciti a inviare l'email. Riprova tra poco.";
      }
      setError(friendly);
      console.error("Invite error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewInvite = () => {
    setSentTo(null);
    setName("");
    setEmail("");
    setRole("adult");
    setError(null);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton} testID="close-button">
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Invita Familiare</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!sentTo ? (
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Invieremo un'email con un link sicuro. La persona sceglierà la propria password
              per entrare nella famiglia.
            </Text>

            <View style={styles.field}>
              <Input
                label="Nome (facoltativo)"
                placeholder="Es. Marco"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                testID="input-name"
              />
            </View>

            <View style={styles.field}>
              <Input
                label="Email"
                placeholder="nome@esempio.it"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="input-email"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Ruolo</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    testID={`role-${r.value}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRole(r.value as Role);
                    }}
                    style={[
                      styles.roleOption,
                      {
                        backgroundColor: role === r.value ? colors.primary : colors.surface,
                        borderColor: role === r.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={r.icon}
                      size={20}
                      color={role === r.value ? "#FFFFFF" : colors.text}
                    />
                    <Text
                      style={[
                        styles.roleLabel,
                        { color: role === r.value ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

            <Button
              title={loading ? "Invio..." : "Invia Invito"}
              onPress={handleInvite}
              disabled={loading}
              style={{ marginTop: 8 }}
              testID="send-invite-button"
            />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="mail-unread" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Invito Inviato</Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Abbiamo inviato un'email a {sentTo}. Il link è valido per 72 ore.
                </Text>
              </View>
            </Card>

            <View style={styles.bottomButtons}>
              <Pressable
                onPress={handleNewInvite}
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Altro invito</Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>Chiudi</Text>
              </Pressable>
            </View>
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
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 20 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  roleOptions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  successContainer: { gap: 0 },
  successIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  bottomButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  textButtonLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
