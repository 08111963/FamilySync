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

export default function ContactSupportScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (trimmedSubject.length < 3) {
      setError("Inserisci un oggetto (almeno 3 caratteri)");
      return;
    }
    if (trimmedMessage.length < 10) {
      setError("Scrivi un messaggio più dettagliato (almeno 10 caratteri)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiRequest("POST", "/api/support", {
        subject: trimmedSubject,
        message: trimmedMessage,
      });
      setSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      let friendly = "Errore nell'invio della richiesta. Riprova.";
      if (msg.includes("SUPPORT_NOT_CONFIGURED") || msg.includes("503")) {
        friendly = "Il servizio di assistenza non è disponibile al momento. Riprova più tardi.";
      } else if (msg.includes("SUPPORT_SEND_FAILED") || msg.includes("502")) {
        friendly = "Non siamo riusciti a inviare la richiesta. Riprova tra poco.";
      } else if (msg.includes("RATE_LIMITED") || msg.includes("429")) {
        friendly = "Hai inviato troppe richieste. Riprova più tardi.";
      }
      setError(friendly);
      console.error("Support request error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSent(false);
    setSubject("");
    setMessage("");
    setError(null);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton} testID="close-button">
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Contatta assistenza</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!sent ? (
          <>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Hai bisogno di aiuto? Scrivici qui: riceverai la risposta direttamente
              all'email del tuo account.
            </Text>

            <View style={styles.field}>
              <Input
                label="Oggetto"
                placeholder="Es. Problema con il calendario"
                value={subject}
                onChangeText={setSubject}
                autoCapitalize="sentences"
                testID="input-subject"
              />
            </View>

            <View style={styles.field}>
              <Input
                label="Messaggio"
                placeholder="Descrivi il problema o la domanda..."
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={6}
                style={styles.messageInput}
                textAlignVertical="top"
                autoCapitalize="sentences"
                testID="input-message"
              />
            </View>

            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

            <Button
              title={loading ? "Invio..." : "Invia richiesta"}
              onPress={handleSend}
              disabled={loading}
              style={{ marginTop: 8 }}
              testID="send-support-button"
            />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Card>
              <View style={{ alignItems: "center", gap: 12 }}>
                <View style={[styles.successIcon, { backgroundColor: colors.success + "20" }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: colors.text }]}>Richiesta inviata</Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Grazie! Abbiamo ricevuto il tuo messaggio. Ti risponderemo via email
                  appena possibile.
                </Text>
              </View>
            </Card>

            <View style={styles.bottomButtons}>
              <Pressable
                onPress={handleNew}
                style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Nuova richiesta</Text>
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
  messageInput: { height: 140, paddingTop: 12, paddingBottom: 12 },
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
