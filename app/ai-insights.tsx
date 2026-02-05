import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";

interface Insight {
  id: string;
  type: string;
  title: string;
  description: string;
  dismissed: boolean;
  createdAt: string;
}

interface ShoppingSuggestion {
  items?: string[];
  suggestions?: string[];
}

export default function AIInsightsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [shoppingSuggestions, setShoppingSuggestions] = useState<ShoppingSuggestion | null>(null);
  const [activeTab, setActiveTab] = useState<"insights" | "shopping" | "chores">("insights");

  const insightsQuery = useQuery<Insight[]>({
    queryKey: ["/api/ai", currentFamily?.id, "insights"],
    enabled: !!currentFamily?.id,
  });

  const insights = insightsQuery.data || [];

  const handleGenerateInsights = async () => {
    if (!currentFamily) return;
    setGeneratingInsights(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await apiRequest("POST", `/api/ai/${currentFamily.id}/insights/generate`);
      qc.invalidateQueries({ queryKey: ["/api/ai", currentFamily.id, "insights"] });
    } catch (error) {
      console.error("Generate insights error:", error);
    } finally {
      setGeneratingInsights(false);
    }
  };

  const handleDismissInsight = async (insightId: string) => {
    if (!currentFamily) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest("PATCH", `/api/ai/${currentFamily.id}/insights/${insightId}/dismiss`);
      qc.invalidateQueries({ queryKey: ["/api/ai", currentFamily.id, "insights"] });
    } catch (error) {
      console.error("Dismiss error:", error);
    }
  };

  const handleGetShoppingSuggestions = async () => {
    if (!currentFamily) return;
    setLoadingSuggestions(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await apiRequest("GET", `/api/ai/${currentFamily.id}/shopping-suggestions`);
      const data = await res.json();
      setShoppingSuggestions(data);
    } catch (error) {
      console.error("Shopping suggestions error:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const getInsightIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "achievement": return "trophy";
      case "warning": return "alert-circle";
      case "tip": return "bulb";
      case "suggestion": return "sparkles";
      default: return "information-circle";
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case "achievement": return colors.accent;
      case "warning": return colors.error;
      case "tip": return colors.secondary;
      case "suggestion": return colors.primary;
      default: return colors.textSecondary;
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Suggerimenti AI</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabRow}>
        {(["insights", "shopping"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab);
            }}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab ? colors.primary : colors.surface,
                borderColor: activeTab === tab ? colors.primary : colors.border,
              },
            ]}
          >
            <Ionicons
              name={tab === "insights" ? "bulb" : "cart"}
              size={16}
              color={activeTab === tab ? "#FFFFFF" : colors.text}
            />
            <Text style={[styles.tabText, { color: activeTab === tab ? "#FFFFFF" : colors.text }]}>
              {tab === "insights" ? "Insights" : "Spesa"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {activeTab === "insights" && (
          <>
            <Pressable
              onPress={handleGenerateInsights}
              disabled={generatingInsights}
              style={({ pressed }) => [
                styles.generateButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {generatingInsights ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Genera Nuovi Insights</Text>
                </>
              )}
            </Pressable>

            {insightsQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : insights.length === 0 ? (
              <EmptyState
                icon="sparkles-outline"
                title="Nessun insight disponibile"
                subtitle="Genera nuovi insights per ricevere suggerimenti personalizzati"
              />
            ) : (
              <View style={styles.insightsList}>
                {insights.map((insight) => (
                  <Card key={insight.id}>
                    <View style={styles.insightRow}>
                      <View style={[styles.insightIcon, { backgroundColor: getInsightColor(insight.type) + "20" }]}>
                        <Ionicons name={getInsightIcon(insight.type)} size={20} color={getInsightColor(insight.type)} />
                      </View>
                      <View style={styles.insightContent}>
                        <Text style={[styles.insightTitle, { color: colors.text }]}>{insight.title}</Text>
                        <Text style={[styles.insightDescription, { color: colors.textSecondary }]}>
                          {insight.description}
                        </Text>
                      </View>
                      <Pressable onPress={() => handleDismissInsight(insight.id)} style={styles.dismissButton}>
                        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === "shopping" && (
          <>
            <Pressable
              onPress={handleGetShoppingSuggestions}
              disabled={loadingSuggestions}
              style={({ pressed }) => [
                styles.generateButton,
                { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {loadingSuggestions ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="cart" size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Suggerisci Spesa</Text>
                </>
              )}
            </Pressable>

            {shoppingSuggestions ? (
              <View style={styles.suggestionsList}>
                {(shoppingSuggestions.items || shoppingSuggestions.suggestions || []).map((item, index) => (
                  <Card key={index}>
                    <View style={styles.suggestionRow}>
                      <View style={[styles.suggestionDot, { backgroundColor: colors.secondary }]} />
                      <Text style={[styles.suggestionText, { color: colors.text }]}>{item}</Text>
                    </View>
                  </Card>
                ))}
              </View>
            ) : (
              <EmptyState
                icon="cart-outline"
                title="Nessun suggerimento"
                subtitle="Tocca il pulsante per generare suggerimenti per la spesa"
              />
            )}
          </>
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
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  content: { flex: 1, paddingHorizontal: 20 },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
  },
  generateButtonText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  insightsList: { gap: 12 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  insightContent: { flex: 1 },
  insightTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  insightDescription: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  dismissButton: { padding: 4 },
  suggestionsList: { gap: 8 },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  suggestionDot: { width: 8, height: 8, borderRadius: 4 },
  suggestionText: { fontSize: 16, fontFamily: "Inter_500Medium", flex: 1 },
});
