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
  TextInput,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
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

  const [generatingAi, setGeneratingAi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

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
    const q = searchQuery.trim();
    const useQuery = q.length >= 2;
    setGeneratingAi(true);
    setAiError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (useQuery) Keyboard.dismiss();
      const endpoint = useQuery
        ? `/api/ai/${currentFamily.id}/recipe-search`
        : `/api/ai/${currentFamily.id}/recipe-suggestions`;
      const body = useQuery ? { query: q } : { count: 8 };
      const data = await apiFetch<{ recipes?: any[]; generatedAt?: string }>(
        endpoint,
        { method: "POST", body }
      );
      const list = data.recipes || [];
      if (list.length === 0) {
        setAiError(
          useQuery
            ? "Nessuna ricetta trovata. Prova con altri termini."
            : "Nessuna ricetta generata. Riprova."
        );
        return;
      }
      router.push({
        pathname: "/recipes/preview" as any,
        params: { recipesJson: JSON.stringify(list) },
      });
    } catch (error: any) {
      if (error?.status === 403) {
        setAiError("Funzionalità AI disabilitata. Attivala nelle Impostazioni.");
      } else {
        setAiError("Errore nella generazione. Riprova.");
      }
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSearch = async () => {
    if (!currentFamily || !searchQuery.trim() || searchQuery.trim().length < 2) return;
    Keyboard.dismiss();
    setSearching(true);
    setAiError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const data = await apiFetch<{ recipes?: any[] }>(
        `/api/ai/${currentFamily.id}/recipe-search`,
        { method: "POST", body: { query: searchQuery.trim() } }
      );
      const list = data.recipes || [];
      if (list.length === 0) {
        setAiError("Nessuna ricetta trovata. Prova con altri termini.");
        return;
      }
      router.push({
        pathname: "/recipes/preview" as any,
        params: { recipesJson: JSON.stringify(list) },
      });
    } catch (error: any) {
      if (error?.status === 403) {
        setAiError("Funzionalità AI disabilitata. Attivala nelle Impostazioni.");
      } else {
        setAiError("Errore nella ricerca. Riprova.");
      }
    } finally {
      setSearching(false);
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Le Mie Ricette
        </Text>
        <Pressable
          onPress={handleGenerateAi}
          disabled={generatingAi}
          style={styles.headerButton}
        >
          {generatingAi ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <Ionicons name="sparkles" size={24} color={colors.secondary} />
          )}
        </Pressable>
      </View>

      {aiError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{aiError}</Text>
          <Pressable onPress={() => setAiError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.error} />
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={handleGenerateAi}
        disabled={generatingAi || searching}
        style={({ pressed }) => [
          styles.generateButton,
          {
            backgroundColor: colors.secondary,
            opacity: pressed || generatingAi ? 0.7 : 1,
            marginHorizontal: 20,
            marginBottom: 10,
          },
        ]}
      >
        {generatingAi ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="sparkles" size={20} color="#FFFFFF" />
        )}
        <Text style={styles.generateButtonText} numberOfLines={1}>
          {generatingAi
            ? "Generazione in corso..."
            : searchQuery.trim().length >= 2
              ? `Genera ricette con "${searchQuery.trim()}"`
              : "Genera Ricette AI"}
        </Text>
      </Pressable>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Cerca una ricetta... es. pasta al forno"
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          editable={!searching && !generatingAi}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : searchQuery.trim().length >= 2 ? (
          <Pressable onPress={handleSearch} hitSlop={8}>
            <Ionicons name="arrow-forward-circle" size={28} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

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
              subtitle="Genera nuove ricette con l'AI usando il pulsante qui sopra"
            />
          )
        }
      />
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
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 2,
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
  centerContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
});
