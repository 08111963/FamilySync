import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
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
  { value: "child", label: "Figlio/a", icon: "happy" as const },
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      const res = await apiRequest("POST", `/api/families/${currentFamily.id}/invite`, {
        email: trimmedEmail,
        invitedName: name.trim() || undefined,
        role,
      });
      const data = await res.json().catch(() => ({}));
      setInviteLink(typeof data?.inviteLink === "string" ? data.inviteLink : null);
      setSentTo(trimmedEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      let friendly = "Errore nell'invio dell'invito. Riprova.";
      if (msg.includes("MEMBER_LIMIT_REACHED")) {
        friendly = "Il piano Free consente al massimo 5 membri. Passa a Premium per aggiungere altri familiari.";
      } else if (msg.includes("409") || msg.includes("ALREADY_MEMBER")) {
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
    setInviteLink(null);
    setCopied(false);
    setName("");
    setEmail("");
    setRole("adult");
    setError(null);
  };

  const handleShareWhatsApp = async () => {
    if (!inviteLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = `Ciao! Ti invito a entrare nella nostra famiglia su FamilySync. Tocca il link per unirti (valido 72 ore):\n${inviteLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
    } catch {
      setError("Impossibile aprire WhatsApp. Copia il link e incollalo manualmente.");
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

            <View style={[styles.shareHint, { backgroundColor: colors.primary + "12" }]}>
              <Ionicons name="share-social-outline" size={18} color={colors.primary} />
              <Text style={[styles.shareHintText, { color: colors.text }]}>
                Dopo aver premuto "Invia Invito" potrai condividere il link anche con
                WhatsApp o tramite QR code.
              </Text>
            </View>

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

            {inviteLink && (
              <Card style={{ marginTop: 16 }}>
                <View style={{ alignItems: "center", gap: 16 }}>
                  <Text style={[styles.shareTitle, { color: colors.text }]}>
                    Condividi anche così
                  </Text>
                  <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                    Fai scansionare il codice QR oppure invia il link con WhatsApp.
                    La persona dovrà registrarsi con l'email {sentTo}.
                  </Text>

                  <View style={styles.qrWrapper}>
                    <QRCode value={inviteLink} size={190} backgroundColor="#FFFFFF" color="#000000" />
                  </View>

                  <Pressable
                    onPress={handleShareWhatsApp}
                    style={({ pressed }) => [styles.whatsappButton, pressed && { opacity: 0.85 }]}
                    testID="share-whatsapp-button"
                  >
                    <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
                    <Text style={styles.whatsappLabel}>Invita con WhatsApp</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleCopyLink}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { borderColor: colors.border },
                      pressed && { opacity: 0.6 },
                    ]}
                    testID="copy-link-button"
                  >
                    <Ionicons
                      name={copied ? "checkmark-circle" : "copy-outline"}
                      size={18}
                      color={copied ? colors.success : colors.text}
                    />
                    <Text style={[styles.copyLabel, { color: copied ? colors.success : colors.text }]}>
                      {copied ? "Link copiato!" : "Copia link"}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            )}

            {error && (
              <Text style={[styles.errorText, { color: colors.error, marginTop: 12 }]}>{error}</Text>
            )}

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
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 16 },
  shareHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  shareHintText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
  shareTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  qrWrapper: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#25D366",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: "100%",
  },
  whatsappLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  copyLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
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
