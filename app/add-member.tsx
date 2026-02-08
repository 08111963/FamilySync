import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Linking, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

const ROLES = [
  { value: "adult", label: "Adulto", icon: "person" as const },
  { value: "child", label: "Ragazzo/a", icon: "happy" as const },
];

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [role, setRole] = useState<"admin" | "adult" | "child">("adult");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateInvite = async () => {
    if (!currentFamily) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest("POST", `/api/families/${currentFamily.id}/invite`, {
        role,
      });
      const data = await res.json();
      setInviteLink(data.inviteLink || null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError("Errore nella creazione dell'invito. Riprova.");
      console.error("Invite error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSendEmail = () => {
    if (!inviteLink) return;
    const familyName = currentFamily?.name || "la famiglia";
    const subject = encodeURIComponent(`Ti invito su FamilySync - ${familyName}`);
    const body = encodeURIComponent(
      `Ciao!\n\nTi invito a entrare nella famiglia "${familyName}" su FamilySync.\n\nClicca il link qui sotto per unirti:\n${inviteLink}\n\nA presto!`
    );
    const to = recipientEmail.trim();
    const mailto = to
      ? `mailto:${to}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
    Linking.openURL(mailto).catch(() => {});
  };

  const handleShareLink = async () => {
    if (!inviteLink) return;
    const familyName = currentFamily?.name || "la famiglia";
    try {
      await Share.share({
        message: `Ti invito a entrare nella famiglia "${familyName}" su FamilySync!\n\n${inviteLink}`,
      });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  const handleNewInvite = () => {
    setInviteLink(null);
    setRecipientEmail("");
    setError(null);
    setCopied(false);
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
              <Text style={[styles.label, { color: colors.text }]}>Ruolo</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRole(r.value as "admin" | "adult" | "child");
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
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Invito Pronto</Text>
              </View>
            </Card>

            <View style={styles.linkSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Link invito</Text>
              <View style={[styles.linkBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.linkText, { color: colors.text }]} selectable numberOfLines={2}>
                  {inviteLink}
                </Text>
              </View>
              <Pressable
                onPress={handleCopyLink}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: copied ? colors.success : colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>
                  {copied ? "Copiato!" : "Copia Link"}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.dividerRow, { borderColor: colors.border }]}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>invia tramite</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {Platform.OS !== "web" ? (
              <View style={styles.sendSection}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Email</Text>
                <Input
                  label=""
                  placeholder="Email del destinatario"
                  value={recipientEmail}
                  onChangeText={setRecipientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={handleSendEmail}
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
                    { marginTop: 10 },
                  ]}
                >
                  <Ionicons name="mail-outline" size={20} color={colors.text} />
                  <Text style={[styles.actionButtonText, { color: colors.text }]}>
                    {recipientEmail.trim() ? "Invia Email" : "Apri App Email"}
                  </Text>
                </Pressable>

                <View style={[styles.dividerRow, { borderColor: colors.border }]}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textSecondary }]}>oppure</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  onPress={handleShareLink}
                  style={({ pressed }) => [
                    styles.actionButton,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="share-outline" size={20} color={colors.text} />
                  <Text style={[styles.actionButtonText, { color: colors.text }]}>Condividi</Text>
                </Pressable>
                <Text style={[styles.emailHint, { color: colors.textSecondary }]}>
                  WhatsApp, Telegram, SMS o altro
                </Text>
              </View>
            ) : (
              <View style={styles.sendSection}>
                <Text style={[styles.hintBox, { color: colors.textSecondary }]}>
                  Copia il link qui sopra e incollalo in un'email, su WhatsApp, Telegram o dove preferisci.
                </Text>
              </View>
            )}

            <View style={styles.bottomButtons}>
              <Pressable
                onPress={handleNewInvite}
                style={({ pressed }) => [
                  styles.textButton,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Nuovo invito</Text>
              </Pressable>

              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.textButton,
                  pressed && { opacity: 0.6 },
                ]}
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
  field: { marginBottom: 24 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
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
  successContainer: { gap: 0 },
  successIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  linkSection: { marginTop: 20 },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  linkBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  linkText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sendSection: { marginTop: 4 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emailHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" },
  hintBox: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
