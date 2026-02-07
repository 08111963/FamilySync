import { useState, useCallback, useMemo } from "react";
import { StyleSheet, Text, View, FlatList, Pressable, Platform, ActivityIndicator, RefreshControl } from "react-native";
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

interface SuggestionItem {
  name: string;
  reason: string;
}

interface ShoppingSuggestion {
  items?: (string | SuggestionItem)[];
  suggestions?: (string | SuggestionItem)[];
}

interface ChoreAssignment {
  choreId: string;
  memberId: string;
  reason?: string;
}

interface ChoreOptimization {
  assignments: ChoreAssignment[];
  message?: string;
}

type TabKey = "insights" | "shopping" | "chores";

const TAB_CONFIG: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "insights", label: "Insights", icon: "bulb" },
  { key: "shopping", label: "Spesa", icon: "cart" },
  { key: "chores", label: "Faccende", icon: "checkmark-circle" },
];

async function parseAiError(res: Response): Promise<{ code: string; message: string } | null> {
  try {
    if (res.status === 403) {
      const body = await res.json();
      if (body?.error?.code) return body.error;
    }
  } catch {}
  return null;
}

export default function AIInsightsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily, data: familyData } = useFamily();
  const qc = useQueryClient();
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingChores, setLoadingChores] = useState(false);
  const [shoppingSuggestions, setShoppingSuggestions] = useState<ShoppingSuggestion | null>(null);
  const [choreOptimization, setChoreOptimization] = useState<ChoreOptimization | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("insights");
  const [aiDisabledBanner, setAiDisabledBanner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    familyData.members.forEach((m) => map.set(m.id, m.name || m.nickname || "Membro"));
    return map;
  }, [familyData.members]);

  const choreMap = useMemo(() => {
    const map = new Map<string, string>();
    familyData.chores.forEach((c) => map.set(c.id, c.title || "Faccenda"));
    return map;
  }, [familyData.chores]);

  const insightsQuery = useQuery<Insight[]>({
    queryKey: ["/api/ai", currentFamily?.id, "insights"],
    enabled: !!currentFamily?.id,
  });

  const insights = insightsQuery.data || [];

  const handleApiError = useCallback(async (res: Response) => {
    const err = await parseAiError(res);
    if (err?.code === "AI_DISABLED") {
      setAiDisabledBanner(true);
      return true;
    }
    return false;
  }, []);

  const handleGenerateInsights = async () => {
    if (!currentFamily) return;
    setGeneratingInsights(true);
    setAiDisabledBanner(false);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await apiRequest("POST", `/api/ai/${currentFamily.id}/insights/generate`);
      if (!res.ok) {
        if (await handleApiError(res)) return;
      }
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
    setAiDisabledBanner(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await apiRequest("GET", `/api/ai/${currentFamily.id}/shopping-suggestions`);
      if (!res.ok) {
        if (await handleApiError(res)) return;
      }
      const data = await res.json();
      setShoppingSuggestions(data);
    } catch (error) {
      console.error("Shopping suggestions error:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleGetChoreOptimization = async () => {
    if (!currentFamily) return;
    setLoadingChores(true);
    setAiDisabledBanner(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await apiRequest("GET", `/api/ai/${currentFamily.id}/chore-optimization`);
      if (!res.ok) {
        if (await handleApiError(res)) return;
        return;
      }
      const data = await res.json();
      setChoreOptimization(data);
    } catch (error) {
      console.error("Chore optimization error:", error);
    } finally {
      setLoadingChores(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setAiDisabledBanner(false);
    try {
      if (activeTab === "insights") {
        await insightsQuery.refetch();
      } else if (activeTab === "shopping") {
        await handleGetShoppingSuggestions();
      } else if (activeTab === "chores") {
        await handleGetChoreOptimization();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, currentFamily?.id]);

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

  const renderInsightItem = useCallback(({ item }: { item: Insight }) => (
    <Card>
      <View style={styles.insightRow}>
        <View style={[styles.insightIcon, { backgroundColor: getInsightColor(item.type) + "20" }]}>
          <Ionicons name={getInsightIcon(item.type)} size={20} color={getInsightColor(item.type)} />
        </View>
        <View style={styles.insightContent}>
          <Text style={[styles.insightTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.insightDescription, { color: colors.textSecondary }]}>
            {item.description}
          </Text>
        </View>
        <Pressable onPress={() => handleDismissInsight(item.id)} style={styles.dismissButton}>
          <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Card>
  ), [colors]);

  const shoppingItems = useMemo(() => {
    if (!shoppingSuggestions) return [];
    return (shoppingSuggestions.items || shoppingSuggestions.suggestions || []).map((item, index) => ({
      key: String(index),
      name: typeof item === "string" ? item : item.name,
      reason: typeof item === "string" ? null : item.reason,
    }));
  }, [shoppingSuggestions]);

  const renderShoppingItem = useCallback(({ item }: { item: { key: string; name: string; reason: string | null } }) => (
    <Card>
      <View style={styles.suggestionRow}>
        <View style={[styles.suggestionDot, { backgroundColor: colors.secondary }]} />
        <View style={styles.suggestionContent}>
          <Text style={[styles.suggestionText, { color: colors.text }]}>{item.name}</Text>
          {item.reason && (
            <Text style={[styles.suggestionReason, { color: colors.textSecondary }]}>{item.reason}</Text>
          )}
        </View>
      </View>
    </Card>
  ), [colors]);

  const choreAssignments = useMemo(() => {
    if (!choreOptimization) return [];
    return choreOptimization.assignments.map((a, i) => ({
      key: String(i),
      choreTitle: choreMap.get(a.choreId) || "Faccenda",
      memberName: memberMap.get(a.memberId) || "Membro",
      reason: a.reason || null,
    }));
  }, [choreOptimization, choreMap, memberMap]);

  const renderChoreItem = useCallback(({ item }: { item: { key: string; choreTitle: string; memberName: string; reason: string | null } }) => (
    <Card>
      <View style={styles.choreRow}>
        <View style={[styles.choreIcon, { backgroundColor: colors.accent + "20" }]}>
          <Ionicons name="arrow-forward" size={16} color={colors.accent} />
        </View>
        <View style={styles.choreContent}>
          <Text style={[styles.choreTitle, { color: colors.text }]}>
            {item.choreTitle}
          </Text>
          <Text style={[styles.choreAssignee, { color: colors.primary }]}>
            {item.memberName}
          </Text>
          {item.reason && (
            <Text style={[styles.choreReason, { color: colors.textSecondary }]}>{item.reason}</Text>
          )}
        </View>
      </View>
    </Card>
  ), [colors]);

  const renderHeader = () => (
    <View>
      {activeTab === "insights" && (
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
      )}

      {activeTab === "shopping" && (
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
      )}

      {activeTab === "chores" && (
        <Pressable
          onPress={handleGetChoreOptimization}
          disabled={loadingChores}
          style={({ pressed }) => [
            styles.generateButton,
            { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {loadingChores ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.generateButtonText}>Ottimizza Faccende</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );

  const renderInsightEmpty = () => {
    if (insightsQuery.isLoading) {
      return <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />;
    }
    return (
      <EmptyState
        icon="sparkles-outline"
        title="Nessun insight disponibile"
        subtitle="Genera nuovi insights per ricevere suggerimenti personalizzati"
      />
    );
  };

  const renderShoppingEmpty = () => (
    <EmptyState
      icon="cart-outline"
      title="Nessun suggerimento"
      subtitle="Tocca il pulsante per generare suggerimenti per la spesa"
    />
  );

  const renderChoresEmpty = () => (
    <EmptyState
      icon="checkmark-circle-outline"
      title="Nessuna ottimizzazione"
      subtitle="Tocca il pulsante per ottimizzare le faccende della famiglia"
    />
  );

  const getTabIcon = (key: TabKey): keyof typeof Ionicons.glyphMap => {
    return TAB_CONFIG.find(t => t.key === key)?.icon || "bulb";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Suggerimenti AI</Text>
        <View style={styles.placeholder} />
      </View>

      {aiDisabledBanner && (
        <View style={[styles.banner, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}>
          <Ionicons name="warning" size={18} color={colors.error} />
          <Text style={[styles.bannerText, { color: colors.error }]}>
            Suggerimenti AI disattivati.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/family");
            }}
            style={[styles.bannerButton, { backgroundColor: colors.error }]}
          >
            <Text style={styles.bannerButtonText}>Impostazioni</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.tabRow}>
        {TAB_CONFIG.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.key);
              setAiDisabledBanner(false);
            }}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab.key ? colors.primary : colors.surface,
                borderColor: activeTab === tab.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? "#FFFFFF" : colors.text}
            />
            <Text style={[styles.tabText, { color: activeTab === tab.key ? "#FFFFFF" : colors.text }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "insights" && (
        <FlatList
          data={insights}
          renderItem={renderInsightItem}
          keyExtractor={(item) => item.id}
          style={styles.content}
          contentContainerStyle={[styles.listContent, insights.length === 0 && styles.emptyContent]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderInsightEmpty}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}

      {activeTab === "shopping" && (
        <FlatList
          data={shoppingItems}
          renderItem={renderShoppingItem}
          keyExtractor={(item) => item.key}
          style={styles.content}
          contentContainerStyle={[styles.listContent, shoppingItems.length === 0 && styles.emptyContent]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderShoppingEmpty}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
        />
      )}

      {activeTab === "chores" && (
        <FlatList
          data={choreAssignments}
          renderItem={renderChoreItem}
          keyExtractor={(item) => item.key}
          style={styles.content}
          contentContainerStyle={[styles.listContent, choreAssignments.length === 0 && styles.emptyContent]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderChoresEmpty}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        />
      )}
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  bannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  content: { flex: 1, paddingHorizontal: 20 },
  listContent: { paddingBottom: 40 },
  emptyContent: { flexGrow: 1 },
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
  suggestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  suggestionDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  suggestionContent: { flex: 1 },
  suggestionText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  suggestionReason: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 18 },
  choreRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  choreIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  choreContent: { flex: 1 },
  choreTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  choreAssignee: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  choreReason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
