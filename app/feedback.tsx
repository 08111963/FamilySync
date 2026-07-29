import { useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { VoiceInput } from "@/components/VoiceInput";
import { apiRequest } from "@/lib/query-client";

type Category = "bug" | "suggestion" | "other";

const SECTIONS: { value: Category; label: string; icon: keyof typeof Ionicons.glyphMap; placeholder: string; voiceContext: string }[] = [
  {
    value: "bug",
    label: "Ho trovato un problema",
    icon: "bug-outline",
    placeholder: "Descrivi il problema: cosa stavi facendo e cosa è successo...",
    voiceContext: "Segnalazione di un problema o errore in un'app per famiglie (calendario, spesa, ricette, chat).",
  },
  {
    value: "suggestion",
    label: "Ho un suggerimento",
    icon: "bulb-outline",
    placeholder: "Racconta la tua idea o la funzione che vorresti...",
    voiceContext: "Suggerimento di una nuova funzione per un'app per famiglie (calendario, spesa, ricette, chat).",
  },
  {
    value: "other",
    label: "Altro",
    icon: "chatbubble-ellipses-outline",
    placeholder: "Qualsiasi altra cosa tu voglia dirci...",
    voiceContext: "Commento libero su un'app per famiglie.",
  },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [messages, setMessages] = useState<Record<Category, string>>({ bug: "", suggestion: "", other: "" });
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMessage = (cat: Category, text: string) => {
    setMessages((prev) => ({ ...prev, [cat]: text }));
  };

  const appendMessage = (cat: Category, text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => ({
      ...prev,
      [cat]: (prev[cat].trim() ? `${prev[cat].trim()} ${t}` : t).slice(0, 2000),
    }));
  };

  const filled = SECTIONS.filter((s) => messages[s.value].trim().length > 0);
  const canSend = filled.length > 0 || rating > 0;

  const handleSend = async () => {
    if (!canSend) {
      setError("Compila almeno un campo o metti una valutazione a stelle");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const platform = Platform.OS;
      const appVersion = Constants.expoConfig?.version || undefined;

      if (filled.length > 0) {
        let first = true;
        for (const s of filled) {
          await apiRequest("POST", "/api/feedback", {
            category: s.value,
            rating: first && rating > 0 ? rating : undefined,
            message: messages[s.value].trim(),
            platform,
            appVersion,
          });
          first = false;
        }
      } else {
        // Solo stelle, nessun testo
        await apiRequest("POST", "/api/feedback", {
          category: "other",
          rating,
          message: "(Solo valutazione a stelle, nessun commento)",
          platform,
          appVersion,
        });
      }

      setSent(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      setError(
        msg.includes("429") || msg.includes("RATE_LIMITED")
          ? "Hai già inviato molti feedback nelle ultime 24 ore. Riprova più tardi, grazie!"
          : "Impossibile inviare il feedback. Riprova."
      );
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton} testID="close-button">
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Dacci il tuo parere</Text>
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
              Stiamo migliorando FamilySync grazie a chi la prova. Compila solo le parti
              che ti interessano: nessun campo è obbligatorio.
            </Text>

            {SECTIONS.map((s) => (
              <View key={s.value} style={styles.sectionBlock}>
                <View style={styles.sectionLabelRow}>
                  <Ionicons name={s.icon} size={18} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.text }]}>{s.label}</Text>
                </View>
                <View style={styles.messageRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      placeholder={s.placeholder}
                      value={messages[s.value]}
                      onChangeText={(t) => setMessage(s.value, t)}
                      multiline
                      numberOfLines={3}
                      maxLength={2000}
                      style={{ minHeight: 72, textAlignVertical: "top" }}
                      testID={`feedback-message-${s.value}`}
                    />
                  </View>
                  {currentFamily?.id ? (
                    <View style={styles.micWrap}>
                      <VoiceInput
                        familyId={currentFamily.id}
                        disabled={loading}
                        context={s.voiceContext}
                        onTranscribed={(text) => appendMessage(s.value, text)}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

            <Text style={[styles.label, { color: colors.text, marginTop: 4 }]}>
              Quanto ti piace l'app? <Text style={{ color: colors.textSecondary }}>(facoltativo)</Text>
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setRating(s === rating ? 0 : s)}
                  hitSlop={6}
                  testID={`feedback-star-${s}`}
                >
                  <Ionicons
                    name={s <= rating ? "star" : "star-outline"}
                    size={34}
                    color={s <= rating ? "#FFB300" : colors.textSecondary}
                  />
                </Pressable>
              ))}
            </View>

            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

            <Button title="Invia feedback" onPress={handleSend} loading={loading} disabled={!canSend} />
          </>
        ) : (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success || "#4CAF50"} />
            <Text style={[styles.successTitle, { color: colors.text }]}>Grazie!</Text>
            <Text style={[styles.successText, { color: colors.textSecondary }]}>
              Il tuo feedback è stato inviato. Ci aiuta davvero a migliorare FamilySync.
            </Text>
            <Button title="Chiudi" onPress={() => router.back()} />
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
    paddingBottom: 12,
  },
  closeButton: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 32 },
  content: { flex: 1, paddingHorizontal: 20 },
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 18 },
  sectionBlock: { marginBottom: 16 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  micWrap: { paddingBottom: 14 },
  starsRow: { flexDirection: "row", gap: 10, marginVertical: 14 },
  error: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 12 },
  successContainer: { alignItems: "center", gap: 16, paddingTop: 40 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
