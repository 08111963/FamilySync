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

const CATEGORIES = [
  { value: "bug", label: "Ho trovato un problema", icon: "bug-outline" as const },
  { value: "suggestion", label: "Ho un suggerimento", icon: "bulb-outline" as const },
  { value: "other", label: "Altro", icon: "chatbubble-ellipses-outline" as const },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();

  const [category, setCategory] = useState<string>("suggestion");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setError("Scrivi qualche dettaglio in più (almeno 5 caratteri)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/feedback", {
        category,
        rating: rating > 0 ? rating : undefined,
        message: trimmed,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version || undefined,
      });
      setSent(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "";
      setError(
        msg.includes("429") || msg.includes("RATE_LIMITED")
          ? "Hai già inviato molti feedback oggi. Riprova domani, grazie!"
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
              Stiamo migliorando FamilySync grazie a chi la prova. Raccontaci se hai
              trovato problemi o hai idee per nuove funzioni.
            </Text>

            <Text style={[styles.label, { color: colors.text }]}>Di cosa si tratta?</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((c) => {
                const active = category === c.value;
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    testID={`feedback-category-${c.value}`}
                  >
                    <Ionicons name={c.icon} size={18} color={active ? "#fff" : colors.text} />
                    <Text style={[styles.categoryText, { color: active ? "#fff" : colors.text }]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>
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

            <View style={styles.messageRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Il tuo messaggio"
                  placeholder="Descrivi il problema o il suggerimento..."
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={5}
                  maxLength={2000}
                  style={{ minHeight: 110, textAlignVertical: "top" }}
                  testID="feedback-message"
                />
              </View>
              {currentFamily?.id ? (
                <View style={styles.micWrap}>
                  <VoiceInput
                    familyId={currentFamily.id}
                    disabled={loading}
                    context="Feedback su un'app per famiglie: segnalazione di un problema o suggerimento su calendario, spesa, ricette, chat."
                    onTranscribed={(text) => {
                      const t = text.trim();
                      if (!t) return;
                      setMessage((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t).slice(0, 2000));
                    }}
                  />
                </View>
              ) : null}
            </View>

            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

            <Button title="Invia feedback" onPress={handleSend} loading={loading} />
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
  intro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  categoryRow: { gap: 8, marginBottom: 20 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  starsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 8 },
  micWrap: { paddingBottom: 14 },
  error: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 12 },
  successContainer: { alignItems: "center", gap: 16, paddingTop: 40 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
