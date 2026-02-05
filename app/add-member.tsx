import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, ActivityIndicator, Share } from "react-native";
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
  { value: "adult", label: "Adulto", icon: "person" as const },
  { value: "teen", label: "Adolescente", icon: "happy" as const },
  { value: "child", label: "Bambino/a", icon: "people" as const },
];

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"adult" | "teen" | "child">("adult");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateInvite = async () => {
    if (!currentFamily) return;
    setLoading(true);
    setError(null);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await apiRequest("POST", `/api/families/${currentFamily.id}/invite`, {
        email: email.trim() || undefined,
        role,
      });
      const data = await res.json();
      setInviteLink(data.token);
    } catch (err) {
      setError("Errore nella creazione dell'invito. Riprova.");
      console.error("Invite error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleShareInvite = async () => {
    if (!inviteLink) return;
    try {
      await Share.share({
        message: `Unisciti alla mia famiglia su FamilySync! Usa questo codice invito: ${inviteLink}`,
      });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Invita Membro</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {!inviteLink ? (
          <>
            <View style={styles.field}>
              <Input
                label="Email (opzionale)"
                placeholder="email@esempio.it"
                value={email}
                onChangeText={setEmail}
                autoFocus
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Se inserisci l'email, verra inviato un invito diretto
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Ruolo</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRole(r.value as "adult" | "teen" | "child");
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

            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            )}

            <Button
              title={loading ? "Creazione..." : "Crea Invito"}
              onPress={handleCreateInvite}
              disabled={loading}
              style={{ marginTop: 24 }}
            />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Card>
              <View style={{ alignItems: "center", gap: 16 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Invito Creato!</Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Condividi il codice invito con il nuovo membro
                </Text>
                <View style={[styles.codeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.codeText, { color: colors.text }]} selectable>
                    {inviteLink}
                  </Text>
                </View>
                <Pressable
                  onPress={handleShareInvite}
                  style={({ pressed }) => [
                    styles.shareButton,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.shareButtonText}>Condividi Invito</Text>
                </Pressable>
              </View>
            </Card>
            <Button
              title="Chiudi"
              onPress={() => router.back()}
              variant="secondary"
              style={{ marginTop: 16 }}
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
  field: { marginBottom: 24 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  roleOptions: { flexDirection: "row", gap: 12 },
  roleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  successContainer: { marginTop: 16 },
  successIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  codeBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
    alignItems: "center",
  },
  codeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
