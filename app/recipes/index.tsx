import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { EmptyState } from "@/components/EmptyState";

interface RecipeTag {
  diet?: string[];
  allergens?: string[];
  cuisine?: string;
  difficulty?: string;
}

interface Recipe {
  id: string;
  familyId: string;
  title: string;
  description?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  steps: string[];
  tags?: RecipeTag | null;
  source?: string;
  createdAt: string;
}

interface AiIngredient {
  name: string;
  quantity?: string;
  unit?: string;
  notes?: string;
  category?: string;
}

interface AiRecipeSuggestion {
  title: string;
  description?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  steps: string[];
  tags?: RecipeTag;
  ingredients: AiIngredient[];
}

interface AiSuggestionsResponse {
  recipes?: AiRecipeSuggestion[];
  suggestions?: AiRecipeSuggestion[];
}

type TabKey = "my" | "ai";

async function fetchAiJson<T>(route: string, options?: { method?: string; body?: any }): Promise<T> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  let token: string | null = null;
  try {
    const stored = await AsyncStorage.getItem("@family_sync_auth");
    if (stored) token = JSON.parse(stored).accessToken || null;
  } catch {}
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options?.body) headers["Content-Type"] = "application/json";
  const res = await globalThis.fetch(url.toString(), {
    method: options?.method || "GET",
    headers,
    credentials: "include",
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { try { await res.text(); } catch {} }
    throw { status: res.status, body };
  }
  return res.json();
}

const TAG_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#74B9FF",
  "#A29BFE",
  "#FAB1A0",
  "#55EFC4",
  "#FFEAA7",
  "#FD79A8",
];

function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length] as string;
}

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [aiSuggestions, setAiSuggestions] = useState<AiRecipeSuggestion[]>([]);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [generatingAi, setGeneratingAi] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const recipesQuery = useQuery<Recipe[]>({
    queryKey: ["/api/recipes", currentFamily?.id, "recipes"],
    enabled: !!currentFamily?.id,
  });

  const recipes = recipesQuery.data || [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await recipesQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [recipesQuery]);

  const handleGenerateAi = async () => {
    if (!currentFamily) return;
    setGeneratingAi(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const data = await fetchAiJson<AiSuggestionsResponse>(
        `/api/ai/${currentFamily.id}/recipe-suggestions`,
        { method: "POST", body: { count: 3 } }
      );
      const list = data.recipes || data.suggestions || [];
      setAiSuggestions(Array.isArray(list) ? list : []);
      setSavedIndices(new Set());
    } catch (error) {
      console.error("AI recipe suggestions error:", error);
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSaveAiRecipe = async (suggestion: AiRecipeSuggestion, index: number) => {
    if (!currentFamily || savedIndices.has(index)) return;
    setSavingIndex(index);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchAiJson(`/api/ai/${currentFamily.id}/recipe-suggestions/save`, {
        method: "POST",
        body: suggestion,
      });
      setSavedIndices((prev) => new Set(prev).add(index));
      qc.invalidateQueries({ queryKey: ["/api/recipes", currentFamily.id, "recipes"] });
    } catch (error) {
      console.error("Save AI recipe error:", error);
    } finally {
      setSavingIndex(null);
    }
  };

  const handleDeleteRecipe = async (recipeId: string, title: string) => {
    if (!currentFamily) return;
    const doDelete = async () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await apiRequest("DELETE", `/api/recipes/${currentFamily.id}/recipes/${recipeId}`);
        qc.invalidateQueries({ queryKey: ["/api/recipes", currentFamily.id, "recipes"] });
      } catch (error) {
        console.error("Delete recipe error:", error);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Vuoi eliminare "${title}"?`)) {
        await doDelete();
      }
    } else {
      Alert.alert("Elimina ricetta", `Vuoi eliminare "${title}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleRecipePress = (recipeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/recipes/${recipeId}` as any);
  };

  const formatTime = (minutes?: number | null): string | null => {
    if (!minutes) return null;
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${minutes} min`;
  };

  const collectTags = (tags?: RecipeTag | null): string[] => {
    if (!tags) return [];
    const result: string[] = [];
    if (tags.cuisine) result.push(tags.cuisine);
    if (tags.difficulty) result.push(tags.difficulty);
    if (tags.diet) result.push(...tags.diet);
    return result;
  };

  const renderRecipeCard = useCallback(
    ({ item }: { item: Recipe }) => {
      const totalTime =
        (item.prepTimeMinutes || 0) + (item.cookTimeMinutes || 0);
      const timeStr = formatTime(totalTime || item.cookTimeMinutes);
      const tagsList = collectTags(item.tags);

      return (
        <Pressable
          onPress={() => handleRecipePress(item.id)}
          onLongPress={() => handleDeleteRecipe(item.id, item.title)}
          style={({ pressed }) => [
            styles.recipeCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.recipeCardHeader}>
            <Text
              style={[styles.recipeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                handleDeleteRecipe(item.id, item.title);
              }}
              hitSlop={12}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 8,
                backgroundColor: pressed ? colors.error + "15" : "transparent",
              })}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </Pressable>
          </View>

          {item.description ? (
            <Text
              style={[styles.recipeDescription, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.recipeInfoRow}>
            {timeStr ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {timeStr}
                </Text>
              </View>
            ) : null}
            {item.servings ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {item.servings}
                </Text>
              </View>
            ) : null}
            {item.source === "ai" ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="sparkles"
                  size={14}
                  color={colors.secondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.secondary }]}
                >
                  AI
                </Text>
              </View>
            ) : null}
          </View>

          {tagsList.length > 0 ? (
            <View style={styles.tagsRow}>
              {tagsList.slice(0, 4).map((tag, idx) => (
                <View
                  key={tag + idx}
                  style={[
                    styles.tagPill,
                    { backgroundColor: getTagColor(idx) + "20" },
                  ]}
                >
                  <Text
                    style={[styles.tagText, { color: getTagColor(idx) }]}
                    numberOfLines={1}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors, currentFamily]
  );

  const renderAiSuggestionCard = useCallback(
    ({ item, index }: { item: AiRecipeSuggestion; index: number }) => {
      const isSaved = savedIndices.has(index);
      const isSaving = savingIndex === index;
      const totalTime =
        (item.prepTimeMinutes || 0) + (item.cookTimeMinutes || 0);
      const timeStr = formatTime(totalTime || item.cookTimeMinutes);

      return (
        <View
          style={[
            styles.recipeCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.recipeCardHeader}>
            <Text
              style={[styles.recipeTitle, { color: colors.text, flex: 1 }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Pressable
              onPress={() => handleSaveAiRecipe(item, index)}
              disabled={isSaved || isSaving}
              hitSlop={8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name={isSaved ? "bookmark" : "bookmark-outline"}
                  size={22}
                  color={isSaved ? colors.success : colors.primary}
                />
              )}
            </Pressable>
          </View>

          {item.description ? (
            <Text
              style={[styles.recipeDescription, { color: colors.textSecondary }]}
              numberOfLines={3}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.recipeInfoRow}>
            {timeStr ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {timeStr}
                </Text>
              </View>
            ) : null}
            {item.servings ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.infoText, { color: colors.textSecondary }]}
                >
                  {item.servings}
                </Text>
              </View>
            ) : null}
          </View>

          {isSaved ? (
            <View style={[styles.savedBadge, { backgroundColor: colors.success + "15" }]}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={[styles.savedText, { color: colors.success }]}>
                Salvata
              </Text>
            </View>
          ) : null}
        </View>
      );
    },
    [colors, savedIndices, savingIndex, currentFamily]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Ricette
        </Text>
        <View style={styles.headerButton} />
      </View>

      <View
        style={[
          styles.tabRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("my");
          }}
          style={[
            styles.tab,
            activeTab === "my" && [
              styles.tabActive,
              { backgroundColor: colors.primary + "15" },
            ],
          ]}
        >
          <Ionicons
            name="book"
            size={18}
            color={activeTab === "my" ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === "my" ? colors.primary : colors.textSecondary,
              },
            ]}
          >
            Le Mie Ricette
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("ai");
          }}
          style={[
            styles.tab,
            activeTab === "ai" && [
              styles.tabActive,
              { backgroundColor: colors.secondary + "15" },
            ],
          ]}
        >
          <Ionicons
            name="sparkles"
            size={18}
            color={
              activeTab === "ai" ? colors.secondary : colors.textSecondary
            }
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color:
                  activeTab === "ai"
                    ? colors.secondary
                    : colors.textSecondary,
              },
            ]}
          >
            Suggerimenti AI
          </Text>
        </Pressable>
      </View>

      {activeTab === "my" ? (
        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id}
          renderItem={renderRecipeCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomInset + 24 },
          ]}
          scrollEnabled={recipes.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            recipesQuery.isLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="restaurant-outline"
                title="Nessuna ricetta"
                subtitle="Usa la tab Suggerimenti AI per generare nuove ricette"
              />
            )
          }
        />
      ) : (
        <FlatList
          data={aiSuggestions}
          keyExtractor={(_, index) => `ai-${index}`}
          renderItem={renderAiSuggestionCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomInset + 24 },
          ]}
          scrollEnabled={aiSuggestions.length > 0}
          ListHeaderComponent={
            <Pressable
              onPress={handleGenerateAi}
              disabled={generatingAi}
              style={({ pressed }) => [
                styles.generateButton,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed || generatingAi ? 0.7 : 1,
                },
              ]}
            >
              {generatingAi ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.generateButtonText}>
                {generatingAi ? "Generazione in corso..." : "Genera Ricette"}
              </Text>
            </Pressable>
          }
          ListEmptyComponent={
            !generatingAi ? (
              <EmptyState
                icon="sparkles-outline"
                title="Nessun suggerimento"
                subtitle="Premi il pulsante per generare ricette con l'AI"
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    borderRadius: 8,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  recipeCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  recipeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  recipeTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    marginRight: 8,
  },
  recipeDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 10,
  },
  recipeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginBottom: 16,
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  savedText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  centerContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
});
