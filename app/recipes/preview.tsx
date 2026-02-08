import { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiFetch, getApiUrl } from "@/lib/query-client";

interface AiIngredient {
  name: string;
  quantity?: string;
  unit?: string;
  notes?: string;
  category?: string;
}

interface RecipeTag {
  diet?: string[];
  allergens?: string[];
  cuisine?: string;
  difficulty?: string;
}

interface AiRecipe {
  title: string;
  description?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  steps: string[];
  tags?: RecipeTag;
  ingredients: AiIngredient[];
}

const UNIT_LABELS: Record<string, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  pcs: "pz",
  tbsp: "cucchiai",
  tsp: "cucchiaini",
  cup: "tazza",
  pinch: "pizzico",
  to_taste: "q.b.",
};

const DIFF_COLORS: Record<string, string> = {
  facile: "#4ECDC4",
  media: "#FAB1A0",
  difficile: "#FF6B6B",
};

function formatTime(minutes?: number): string | null {
  if (!minutes) return null;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${minutes} min`;
}

function formatUnit(unit?: string | null): string {
  if (!unit) return "";
  return UNIT_LABELS[unit] || unit;
}

function RecipePreviewCard({
  recipe,
  index,
  isSelected,
  onToggle,
  onOpenDetail,
  colors,
}: {
  recipe: AiRecipe;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  colors: any;
}) {
  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const timeStr = formatTime(totalTime || recipe.cookTimeMinutes);
  const difficulty = recipe.tags?.difficulty;
  const diffColor = difficulty ? (DIFF_COLORS[difficulty.toLowerCase()] || "#A29BFE") : null;

  return (
    <View
      style={[
        styles.recipeCard,
        {
          backgroundColor: colors.surface,
          borderColor: isSelected ? colors.primary : colors.border,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          style={[
            styles.checkbox,
            {
              borderColor: isSelected ? colors.primary : colors.border,
              backgroundColor: isSelected ? colors.primary : "transparent",
            },
          ]}
        >
          {isSelected ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : null}
        </Pressable>
        <Pressable onPress={onOpenDetail} style={styles.cardContent}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {recipe.title}
          </Text>
        </Pressable>
      </View>

      {recipe.description ? (
        <Pressable onPress={onOpenDetail}>
          <Text
            style={[styles.cardDescription, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {recipe.description}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.cardInfoRow}>
        {timeStr ? (
          <View style={styles.infoPill}>
            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>{timeStr}</Text>
          </View>
        ) : null}
        {recipe.servings ? (
          <View style={styles.infoPill}>
            <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>{recipe.servings}</Text>
          </View>
        ) : null}
        {difficulty && diffColor ? (
          <View style={[styles.infoPill, { backgroundColor: diffColor + "18" }]}>
            <Text style={[styles.infoText, { color: diffColor }]}>{difficulty}</Text>
          </View>
        ) : null}
        {recipe.tags?.cuisine ? (
          <View style={[styles.infoPill, { backgroundColor: "#A29BFE18" }]}>
            <Text style={[styles.infoText, { color: "#A29BFE" }]}>{recipe.tags.cuisine}</Text>
          </View>
        ) : null}
      </View>

      <Pressable onPress={onOpenDetail} style={styles.detailLink}>
        <Text style={[styles.detailLinkText, { color: colors.primary }]}>Vedi dettagli</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function RecipeDetailModal({
  recipe,
  visible,
  onClose,
  colors,
}: {
  recipe: AiRecipe | null;
  visible: boolean;
  onClose: () => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  if (!recipe) return null;

  const prepTime = formatTime(recipe.prepTimeMinutes);
  const cookTime = formatTime(recipe.cookTimeMinutes);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 8 }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>
            {recipe.title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.modalClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {(prepTime || cookTime || recipe.servings) ? (
            <View style={[styles.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {prepTime ? (
                <View style={styles.infoBlock}>
                  <Ionicons name="timer-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Preparazione</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{prepTime}</Text>
                  </View>
                </View>
              ) : null}
              {cookTime ? (
                <View style={styles.infoBlock}>
                  <Ionicons name="flame-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Cottura</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{cookTime}</Text>
                  </View>
                </View>
              ) : null}
              {recipe.servings ? (
                <View style={styles.infoBlock}>
                  <Ionicons name="people-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Porzioni</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{recipe.servings}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {recipe.description ? (
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {recipe.description}
            </Text>
          ) : null}

          {recipe.ingredients.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredienti</Text>
              <View style={[styles.ingredientsList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {recipe.ingredients.map((ing, idx) => {
                  const unitLabel = formatUnit(ing.unit);
                  const qtyText = ing.quantity
                    ? unitLabel ? `${ing.quantity} ${unitLabel}` : ing.quantity
                    : unitLabel || null;

                  return (
                    <View
                      key={`${ing.name}-${idx}`}
                      style={[
                        styles.ingredientRow,
                        idx < recipe.ingredients.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={[styles.ingredientDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.ingredientName, { color: colors.text }]}>{ing.name}</Text>
                      {qtyText ? (
                        <Text style={[styles.ingredientQty, { color: colors.textSecondary }]}>{qtyText}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {recipe.steps.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Preparazione</Text>
              {recipe.steps.map((step, idx) => (
                <View
                  key={idx}
                  style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

async function fetchAiRecipes(familyId: string, excludeTitles: string[]): Promise<AiRecipe[]> {
  const body: any = { count: 8 };
  if (excludeTitles.length > 0) body.excludeTitles = excludeTitles;
  const data = await apiFetch<{ recipes?: AiRecipe[] }>(
    `/api/ai/${familyId}/recipe-suggestions`,
    { method: "POST", body }
  );
  return data.recipes || [];
}

export default function RecipePreviewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ recipesJson: string }>();

  const initialRecipes = useMemo<AiRecipe[]>(() => {
    try {
      const parsed = JSON.parse(params.recipesJson || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [params.recipesJson]);

  const [allRecipes, setAllRecipes] = useState<AiRecipe[]>(initialRecipes);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seenTitles, setSeenTitles] = useState<string[]>(() => initialRecipes.map(r => r.title));

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const toggleSelect = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(prev => {
      if (prev.size === allRecipes.length) {
        return new Set();
      }
      return new Set(allRecipes.map((_, i) => i));
    });
  }, [allRecipes.length]);

  const handleRefresh = async () => {
    if (!currentFamily || refreshing) return;
    setRefreshing(true);
    setSaveError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newRecipes = await fetchAiRecipes(currentFamily.id, seenTitles);
      if (newRecipes.length === 0) {
        setSaveError("Nessuna ricetta generata. Riprova.");
        return;
      }
      setSeenTitles(prev => [...prev, ...newRecipes.map(r => r.title)]);
      setAllRecipes(newRecipes);
      setSelected(new Set());
      setDetailIndex(null);
    } catch {
      setSaveError("Errore nella generazione. Riprova.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    if (!currentFamily || selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const recipesToSave = allRecipes
        .filter((_, i) => selected.has(i))
        .map(r => ({
          title: r.title,
          description: r.description,
          servings: r.servings,
          prepTimeMinutes: r.prepTimeMinutes,
          cookTimeMinutes: r.cookTimeMinutes,
          steps: r.steps,
          tags: r.tags,
          ingredients: r.ingredients.map(ing => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes,
            category: ing.category,
          })),
        }));

      await apiFetch("/api/recipes/bulk", {
        method: "POST",
        body: { familyId: currentFamily.id, recipes: recipesToSave },
      });

      qc.invalidateQueries({ queryKey: ["/api/recipes", currentFamily.id, "recipes"] });
      router.back();
    } catch (error) {
      setSaveError("Errore nel salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  const renderItem = useCallback(({ item, index }: { item: AiRecipe; index: number }) => {
    return (
      <RecipePreviewCard
        recipe={item}
        index={index}
        isSelected={selected.has(index)}
        onToggle={() => toggleSelect(index)}
        onOpenDetail={() => setDetailIndex(index)}
        colors={colors}
      />
    );
  }, [selected, colors, toggleSelect]);

  const detailRecipe = detailIndex !== null ? allRecipes[detailIndex] ?? null : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Ricette suggerite
        </Text>
        <Pressable onPress={selectAll} style={styles.headerButton} hitSlop={8}>
          <Ionicons
            name={selected.size === allRecipes.length ? "checkbox" : "checkbox-outline"}
            size={24}
            color={selected.size === allRecipes.length ? colors.primary : colors.textSecondary}
          />
        </Pressable>
      </View>

      <View style={[styles.summaryBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          {allRecipes.length} ricette generate
        </Text>
        <View style={[styles.selectedBadge, { backgroundColor: colors.primary + "15" }]}>
          <Text style={[styles.selectedText, { color: colors.primary }]}>
            {selected.size} selezionate
          </Text>
        </View>
      </View>

      {saveError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{saveError}</Text>
        </View>
      ) : null}

      <FlatList
        data={allRecipes}
        keyExtractor={(_, index) => `preview-${index}`}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 80 }]}
        scrollEnabled={allRecipes.length > 0}
      />

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12, backgroundColor: colors.background }]}>
        <View style={styles.bottomButtons}>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing || saving}
            style={({ pressed }) => [
              styles.refreshButton,
              {
                borderColor: colors.secondary,
                opacity: pressed || refreshing ? 0.7 : 1,
              },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.secondary} />
            )}
            <Text style={[styles.refreshButtonText, { color: colors.secondary }]}>
              {refreshing ? "Caricamento..." : "Altre Ricette"}
            </Text>
          </Pressable>

          {selected.size > 0 ? (
            <Pressable
              onPress={handleSave}
              disabled={saving || refreshing}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || saving ? 0.7 : 1,
                  flex: 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="bookmark" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.saveButtonText}>
                {saving ? "Salvataggio..." : `Salva (${selected.size})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <RecipeDetailModal
        recipe={detailRecipe}
        visible={detailIndex !== null}
        onClose={() => setDetailIndex(null)}
        colors={colors}
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
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  selectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectedText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  recipeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 22,
  },
  cardDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 8,
    marginLeft: 36,
  },
  cardInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginLeft: 36,
    marginBottom: 6,
  },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  detailLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 36,
    marginTop: 4,
  },
  detailLinkText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 10,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
  },
  refreshButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    marginRight: 12,
    lineHeight: 28,
  },
  modalClose: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalDescription: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  ingredientsList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  ingredientQty: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    marginTop: 1,
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});
