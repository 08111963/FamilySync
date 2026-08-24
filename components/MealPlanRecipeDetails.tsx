import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface MealPlanRecipeIngredient {
  name: string;
  quantity?: string | null;
  unit?: string | null;
}

export interface MealPlanRecipeDetailsProps {
  description?: string | null;
  servings?: number | null;
  ingredients?: MealPlanRecipeIngredient[] | null;
  steps?: string[] | null;
  notes?: string | null;
  colors: {
    background: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    primary: string;
  };
  mealColor: string;
  onAddToShoppingList?: () => void;
  addingToShoppingList?: boolean;
  addedToShoppingList?: boolean;
  testIDPrefix?: string;
}

const UNIT_LABELS: Record<string, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  pcs: "pz",
  pezzo: "pz",
  pezzi: "pz",
  tbsp: "cucchiai",
  tsp: "cucchiaini",
  cup: "tazza",
  pinch: "pizzico",
  to_taste: "q.b.",
};

function formatUnit(unit?: string | null): string {
  if (!unit) return "";
  return UNIT_LABELS[unit] || unit;
}

/**
 * I primi piani salvati prima del campo steps hanno la ricetta serializzata
 * dentro notes. La lettura è volutamente conservativa: le note libere che non
 * seguono il formato noto restano visibili come testo, senza inventare dati.
 */
export function parseMealPlanNotes(notes?: string | null): {
  description?: string;
  ingredients: MealPlanRecipeIngredient[];
  steps: string[];
} {
  const raw = (notes ?? "").trim();
  if (!raw) return { ingredients: [], steps: [] };

  const ingredientMarker = "Ingredienti:\n";
  const recipeMarker = "Ricetta:\n";
  const descriptionEnd = [raw.indexOf(ingredientMarker), raw.indexOf(recipeMarker)]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const description = (descriptionEnd === undefined ? raw : raw.slice(0, descriptionEnd))
    .trim();

  const ingredientStart = raw.indexOf(ingredientMarker);
  const recipeStart = raw.indexOf(recipeMarker);
  const ingredientSection = ingredientStart >= 0
    ? raw.slice(ingredientStart + ingredientMarker.length, recipeStart >= 0 ? recipeStart : raw.length)
    : "";
  const stepsSection = recipeStart >= 0 ? raw.slice(recipeStart + recipeMarker.length) : "";

  const ingredients = ingredientSection
    .split("\n")
    .map((line) => line.replace(/^\s*[•*-]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)(?:\s+(\S+))?\s+(.+)$/);
      if (!match) return { name: line };
      return {
        quantity: match[1],
        unit: match[2],
        name: match[3]!,
      };
    });
  const steps = stepsSection
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

  return {
    ...(description && description !== raw ? { description } : {}),
    ingredients,
    steps,
  };
}

export function MealPlanRecipeDetails({
  description,
  servings,
  ingredients,
  steps,
  notes,
  colors,
  mealColor,
  onAddToShoppingList,
  addingToShoppingList = false,
  addedToShoppingList = false,
  testIDPrefix = "meal-plan-recipe",
}: MealPlanRecipeDetailsProps) {
  const legacy = parseMealPlanNotes(notes);
  const resolvedDescription = description?.trim() || legacy.description;
  const resolvedIngredients = (ingredients ?? []).filter((ingredient) => ingredient.name?.trim());
  const displayedIngredients = resolvedIngredients.length > 0 ? resolvedIngredients : legacy.ingredients;
  const resolvedSteps = (steps ?? []).map((step) => step.trim()).filter(Boolean);
  const displayedSteps = resolvedSteps.length > 0 ? resolvedSteps : legacy.steps;
  const normalizedServings = typeof servings === "number" && servings > 0 ? servings : null;

  return (
    <View style={styles.container}>
      {resolvedDescription ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {resolvedDescription}
        </Text>
      ) : null}

      {normalizedServings !== null ? (
        <Text style={[styles.servings, { color: colors.primary }]}>
          Ricetta per {normalizedServings} {normalizedServings === 1 ? "persona" : "persone"}
        </Text>
      ) : null}

      {displayedIngredients.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredienti</Text>
          {onAddToShoppingList ? (
            <Pressable
              testID={`${testIDPrefix}-add-to-shopping-list`}
              onPress={onAddToShoppingList}
              disabled={addingToShoppingList}
              style={[
                styles.shoppingButton,
                {
                  backgroundColor: addedToShoppingList ? colors.surface : colors.primary,
                  borderColor: colors.primary,
                  opacity: addingToShoppingList ? 0.6 : 1,
                },
              ]}
            >
              {addingToShoppingList ? (
                <ActivityIndicator size="small" color={addedToShoppingList ? colors.primary : "#FFFFFF"} />
              ) : (
                <Ionicons
                  name={addedToShoppingList ? "checkmark-circle" : "cart-outline"}
                  size={20}
                  color={addedToShoppingList ? colors.primary : "#FFFFFF"}
                />
              )}
              <Text style={[styles.shoppingButtonText, { color: addedToShoppingList ? colors.primary : "#FFFFFF" }]}>
                {addedToShoppingList ? "Aggiunti alla spesa" : "Aggiungi alla lista della spesa"}
              </Text>
            </Pressable>
          ) : null}
          <View style={[styles.ingredientsList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {displayedIngredients.map((ingredient, index) => {
              const unitLabel = formatUnit(ingredient.unit);
              const quantity = ingredient.quantity
                ? unitLabel ? `${ingredient.quantity} ${unitLabel}` : ingredient.quantity
                : unitLabel || null;
              return (
                <View
                  key={`${ingredient.name}-${index}`}
                  style={[
                    styles.ingredientRow,
                    index < displayedIngredients.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.ingredientDot, { backgroundColor: mealColor }]} />
                  <Text style={[styles.ingredientName, { color: colors.text }]}>{ingredient.name}</Text>
                  {quantity ? (
                    <Text style={[styles.ingredientQuantity, { color: colors.textSecondary }]}>{quantity}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {displayedSteps.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Preparazione</Text>
          {displayedSteps.map((step, index) => (
            <View
              key={`${index}-${step}`}
              style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.stepNumber, { backgroundColor: mealColor }]}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  servings: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  shoppingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  shoppingButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  ingredientsList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  ingredientDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  ingredientQuantity: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    marginLeft: 8,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
});