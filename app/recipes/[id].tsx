import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";

interface RecipeTag {
  diet?: string[];
  allergens?: string[];
  cuisine?: string;
  difficulty?: string;
}

interface Ingredient {
  id: string;
  recipeId: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  category?: string | null;
}

interface RecipeDetail {
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
  ingredients: Ingredient[];
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

function formatTime(minutes?: number | null): string | null {
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

function collectTags(tags?: RecipeTag | null): string[] {
  if (!tags) return [];
  const result: string[] = [];
  if (tags.cuisine) result.push(tags.cuisine);
  if (tags.difficulty) result.push(tags.difficulty);
  if (tags.diet) result.push(...tags.diet);
  return result;
}

export default function RecipeDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const { id } = useLocalSearchParams<{ id: string }>();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: recipe, isLoading } = useQuery<RecipeDetail>({
    queryKey: ["/api/recipes", currentFamily?.id, "recipes", id],
    enabled: !!currentFamily?.id && !!id,
  });

  if (isLoading || !recipe) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInset + 16 }]}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Dettaglio Ricetta
          </Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const prepTime = formatTime(recipe.prepTimeMinutes);
  const cookTime = formatTime(recipe.cookTimeMinutes);
  const tagsList = collectTags(recipe.tags);
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          Dettaglio Ricetta
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomInset + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.recipeTitle, { color: colors.text }]}>
          {recipe.title}
        </Text>

        {(prepTime || cookTime || recipe.servings) ? (
          <View
            style={[
              styles.infoRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {prepTime ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="timer-outline"
                  size={18}
                  color={colors.primary}
                />
                <View>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    Preparazione
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {prepTime}
                  </Text>
                </View>
              </View>
            ) : null}
            {cookTime ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="flame-outline"
                  size={18}
                  color={colors.primary}
                />
                <View>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    Cottura
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {cookTime}
                  </Text>
                </View>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.infoItem}>
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={colors.primary}
                />
                <View>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    Porzioni
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {recipe.servings}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {recipe.description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {recipe.description}
          </Text>
        ) : null}

        {tagsList.length > 0 ? (
          <View style={styles.tagsRow}>
            {tagsList.map((tag, idx) => (
              <View
                key={tag + idx}
                style={[
                  styles.tagPill,
                  {
                    backgroundColor:
                      (TAG_COLORS[idx % TAG_COLORS.length] as string) + "20",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    { color: TAG_COLORS[idx % TAG_COLORS.length] as string },
                  ]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {ingredients.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Ingredienti
            </Text>
            <View
              style={[
                styles.ingredientsList,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {ingredients.map((ing, idx) => {
                const unitLabel = formatUnit(ing.unit);
                const qtyText = ing.quantity
                  ? unitLabel
                    ? `${ing.quantity} ${unitLabel}`
                    : ing.quantity
                  : unitLabel || null;

                return (
                  <View
                    key={ing.id || idx}
                    style={[
                      styles.ingredientRow,
                      idx < ingredients.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.ingredientDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                    <Text
                      style={[styles.ingredientName, { color: colors.text }]}
                    >
                      {ing.name}
                    </Text>
                    {qtyText ? (
                      <Text
                        style={[
                          styles.ingredientQty,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {qtyText}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Preparazione
            </Text>
            {steps.map((step, idx) => (
              <View
                key={idx}
                style={[
                  styles.stepCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.stepNumber,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.stepNumberText}>{idx + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.text }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  recipeTitle: {
    fontSize: 28,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 34,
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
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 16,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  tagText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
