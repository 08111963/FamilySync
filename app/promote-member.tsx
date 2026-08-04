import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

// Schermata "Promuovi profilo": trasforma un profilo bambino (senza account)
// in un account vero. Invia un invito email legato al membro esistente: quando
// il ragazzo/a accetta, il suo account viene collegato al profilo e punti,
// faccende e storico restano intatti.
export default function PromoteMemberScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const params = useLocalSearchParams<{ memberId?: string; memberName?: string }>();

  const memberId = typeof params.memberId === "string" ? params.memberId : "";
  const memberName = typeof params.memberName === "string" && params.memberName ? params.memberName : "il profilo";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleSend = async () => {
    if (!currentFamily || !memberId) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      setError("Inserisci un indirizzo email valido");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/families/${currentFamily.id}/members/${memberId}/promote`,
        { email: trimmedEmail }
      );
      const data = await res.json().catch(() => ({}));
      setInviteLink(typeof data?.inviteLink === "string" ? data.inviteLink : null);
      setSentTo(trimmedEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      let friendly = "Errore nell'invio dell'invito. Riprova.";
      if (msg.includes("ALREADY_LINKED")) {
        friendly = "Questo profilo ha già un account collegato.";
      } else if (msg.includes("ALREADY_MEMBER")) {
        friendly = "Questa email appartiene già a un membro della famiglia.";
      } else if (msg.includes("FORBIDDEN") || msg.includes("403")) {
        friendly = "Solo un genitore (admin o adulto) può promuovere un profilo.";
      } else if (msg.includes("EMAIL_NOT_CONFIGURED") || msg.includes("503")) {
        friendly = "Il servizio email non è configurato. Contatta l'assistenza.";
      } else if (msg.includes("EMAIL_SEND_FAILED") || msg.includes("502")) {
        friendly = "Non siamo riusciti a inviare l'email. Riprova tra poco.";
      } else if (msg.includes("NOT_FOUND") || msg.includes("404")) {
        friendly = "Profilo non trovato. Torna alla schermata Famiglia e riprova.";
      }
      setError(friendly);
      console.error("Promote member error:", err);
    } finally {
      setLoading(false);
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
        <Text style={[styles.title, { color: colors.text }]}>Promuovi ad account</Text>
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
              Invia un invito email a {memberName}: quando lo accetta, il suo nuovo
              account viene collegato al profilo esistente. Punti, faccende e storico
              restano intatti.
            </Text>

            <View style={styles.field}>
              <Input
                label={`Email di ${memberName}`}
                placeholder="nome@esempio.it"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                testID="input-promote-email"
              />
            </View>

            <View style={[styles.noteBox, { backgroundColor: colors.primary + "12" }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.noteText, { color: colors.text }]}>
                Il ruolo resta quello attuale del profilo. Il link è valido per 72 ore.
              </Text>
            </View>

            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

            <Button
              title={loading ? "Invio..." : "Invia invito"}
              onPress={handleSend}
              disabled={loading}
              style={{ marginTop: 8 }}
              testID="send-promote-button"
            />
          </>
        ) : (
          <View style={{ marginTop: 8 }}>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="mail-unread" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Invito inviato</Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Abbiamo inviato un'email a {sentTo}. Quando l'invito viene accettato,
                  l'account sarà collegato al profilo di {memberName}.
                </Text>
              </View>
            </Card>

            {inviteLink && (
              <Pressable
                onPress={handleCopyLink}
                style={({ pressed }) => [
                  styles.copyButton,
                  { borderColor: colors.border, marginTop: 16 },
                  pressed && { opacity: 0.6 },
                ]}
                testID="copy-promote-link-button"
              >
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={18}
                  color={copied ? colors.success : colors.text}
                />
                <Text style={[styles.copyLabel, { color: copied ? colors.success : colors.text }]}>
                  {copied ? "Link copiato!" : "Copia link invito"}
                </Text>
              </Pressable>
            )}

            <View style={styles.bottomButtons}>
              <View />
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
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 16, marginTop: 16 },
  field: { marginBottom: 20 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  noteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8, textAlign: "center" },
  successIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
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
  bottomButtons: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 },
  textButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  textButtonLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
