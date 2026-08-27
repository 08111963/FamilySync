import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

const REASON_CATEGORIES = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Molestie" },
  { key: "hate", label: "Odio" },
  { key: "sexual", label: "Sessuale" },
  { key: "violence", label: "Violenza" },
  { key: "other", label: "Altro" },
] as const;

export default function ReportUserScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId, familyId } = useLocalSearchParams<{ userId: string; familyId: string }>();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    if (!selectedCategory || !userId || !familyId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      await apiRequest("POST", "/api/moderation/report", {
        familyId,
        targetType: "user",
        targetId: userId,
        reasonCategory: selectedCategory,
        reasonText: reasonText.trim() || undefined,
      });

      if (Platform.OS === "web") {
        alert("Segnalazione inviata con successo");
      } else {
        Alert.alert("Successo", "Segnalazione inviata con successo", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }
      router.back();
    } catch {
      if (Platform.OS === "web") {
        alert("Errore nell'invio della segnalazione");
      } else {
        Alert.alert("Errore", "Errore nell'invio della segnalazione");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: bottomInset + 24 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Segnala Utente</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Motivo della segnalazione</Text>
        <View style={styles.categoriesGrid}>
          {REASON_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCategory(cat.key);
                }}
                style={[
                  styles.categoryButton,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    { color: isSelected ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 24 }]}>
          Dettagli aggiuntivi (opzionale)
        </Text>
        <Card>
          <TextInput
            style={[styles.textInput, { color: colors.text }]}
            placeholder="Descrivi il problema..."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={500}
            value={reasonText}
            onChangeText={setReasonText}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: colors.textSecondary }]}>
            {reasonText.length}/500
          </Text>
        </Card>

        <Pressable
          onPress={handleSubmit}
          disabled={!selectedCategory || isSubmitting}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: !selectedCategory || isSubmitting ? colors.border : colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? "Invio in corso..." : "Invia Segnalazione"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  content: {
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  textInput: {
    minHeight: 100,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 8,
  },
  submitButton: {
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
