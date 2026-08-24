import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { MealPlanRecipeDetails } from "@/components/MealPlanRecipeDetails";

interface PlanItem {
  id: string;
  date: string;
  mealType: string;
  recipeId?: string | null;
  recipeTitle?: string | null;
  titleOverride?: string | null;
  servings?: number | null;
  notes?: string | null;
  ingredients?: Array<{ name: string; quantity?: string | null; unit?: string | null }> | null;
  steps?: string[] | null;
  recipeDescription?: string | null;
  recipeServings?: number | null;
}

interface PlanDetail {
  id: string;
  title: string;
  weekStartDate: string;
  items: PlanItem[];
}

const MEAL_ORDER = ["breakfast", "lunch", "snack", "dinner"];
const WEEKDAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function getMealTypeLabel(mealType: string): string {
  switch (mealType) {
    case "breakfast": return "Colazione";
    case "lunch": return "Pranzo";
    case "dinner": return "Cena";
    case "snack": return "Spuntino";
    default: return mealType;
  }
}

function getMealTypeColor(mealType: string, primary: string, secondary: string): string {
  switch (mealType) {
    case "breakfast": return "#FFB74D";
    case "lunch": return secondary;
    case "dinner": return primary;
    case "snack": return "#A29BFE";
    default: return "#999";
  }
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatWeekDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `Settimana del ${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function MealRow({
  item,
  colors,
  onAddToShoppingList,
  addingToShoppingList,
  addedToShoppingList,
}: {
  item: PlanItem;
  colors: ReturnType<typeof useTheme>["colors"];
  onAddToShoppingList: (item: PlanItem) => void;
  addingToShoppingList: boolean;
  addedToShoppingList: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const mealColor = getMealTypeColor(item.mealType, colors.primary, colors.secondary);
  const title = item.titleOverride || item.recipeTitle || "Pasto";
  const notes = (item.notes ?? "").trim();
  const servings = typeof item.servings === "number" && item.servings > 0
    ? item.servings
    : item.recipeServings ?? null;
  const hasDetails = Boolean(
    notes
    || servings
    || item.recipeDescription
    || item.ingredients?.some((ingredient) => ingredient.name?.trim())
    || item.steps?.some((step) => step.trim()),
  );

  return (
    <View style={[styles.mealRow, { borderLeftColor: mealColor }]}>
      <Pressable
        onPress={() => {
          if (!hasDetails) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((e) => !e);
        }}
        style={styles.mealRowHeader}
        testID={`view-meal-${item.id}`}
      >
        <View style={[styles.mealTypeBadge, { backgroundColor: mealColor + "20" }]}>
          <Text style={[styles.mealTypeText, { color: mealColor }]}>
            {getMealTypeLabel(item.mealType)}
          </Text>
        </View>
        <Text style={[styles.mealTitle, { color: colors.text }]}>{title}</Text>
        {hasDetails && (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        )}
      </Pressable>
      {hasDetails && expanded && (
        <View style={styles.notesBox}>
          <MealPlanRecipeDetails
            description={item.recipeDescription}
            servings={servings}
            ingredients={item.ingredients}
            steps={item.steps}
            notes={notes}
            colors={colors}
            mealColor={mealColor}
            onAddToShoppingList={() => onAddToShoppingList(item)}
            addingToShoppingList={addingToShoppingList}
            addedToShoppingList={addedToShoppingList}
            testIDPrefix={`saved-meal-${item.id}`}
          />
        </View>
      )}
    </View>
  );
}

export default function MealPlanViewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ planId?: string }>();
  const planId = typeof params.planId === "string" && params.planId ? params.planId : null;
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(() => new Set());

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const planQuery = useQuery<PlanDetail>({
    queryKey: ["/api/meal-plans", currentFamily?.id, "meal-plans", planId],
    enabled: !!currentFamily?.id && !!planId,
  });

  const plan = planQuery.data ?? null;

  const handleAddMealToShoppingList = async (item: PlanItem) => {
    if (!currentFamily || !planId || addingItemId) return;
    setAddingItemId(item.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiRequest(
        "POST",
        `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/to-shopping-list`,
        { itemId: item.id },
      );
      const data = await res.json().catch(() => ({}));
      const skipped: string[] = Array.isArray(data?.skippedFromPantry) ? data.skippedFromPantry : [];
      let message = data?.shoppingListId
        ? `${data.ingredientCount} ingredienti aggiunti alla lista della spesa.`
        : "Nessuna lista creata: hai già tutti gli ingredienti in dispensa.";
      if (skipped.length > 0) {
        message += `\n\nGià in dispensa (non aggiunti): ${skipped.join(", ")}.`;
      }
      setAddedItemIds((previous) => new Set(previous).add(item.id));
      qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamily.id, "lists"] });
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert(data?.shoppingListId ? "Lista creata" : "Tutto in dispensa", message);
      }
    } catch {
      const message = "Impossibile aggiungere gli ingredienti alla lista della spesa.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Errore", message);
      }
    } finally {
      setAddingItemId(null);
    }
  };

  // Pasti raggruppati per giorno, giorni in ordine, pasti in ordine
  // colazione → pranzo → spuntino → cena.
  const grouped: { date: string; items: PlanItem[] }[] = [];
  if (plan?.items) {
    const groups = new Map<string, PlanItem[]>();
    for (const item of plan.items) {
      if (!groups.has(item.date)) groups.set(item.date, []);
      groups.get(item.date)!.push(item);
    }
    for (const [date, items] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      items.sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
      grouped.push({ date, items });
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="view-plan-back">
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {plan?.title || "Piano Pasti"}
        </Text>
        <Pressable
          onPress={() => {
            if (!planId) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace({ pathname: "/meal-plans/edit" as any, params: { planId } });
          }}
          hitSlop={10}
          testID="view-plan-edit"
        >
          <Ionicons name="pencil" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {planQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !plan ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Piano non trovato.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>
            {formatWeekDate(plan.weekStartDate)} · {plan.items.length} pasti
          </Text>
          {grouped.map((group) => (
            <View key={group.date} style={styles.dayBlock}>
              <Text style={[styles.dayTitle, { color: colors.text }]}>{dayLabel(group.date)}</Text>
              <View style={[styles.dayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {group.items.map((item) => (
                  <MealRow
                    key={item.id}
                    item={item}
                    colors={colors}
                    onAddToShoppingList={handleAddMealToShoppingList}
                    addingToShoppingList={addingItemId === item.id}
                    addedToShoppingList={addedItemIds.has(item.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
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
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  weekLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
    textAlign: "center",
  },
  dayBlock: { marginBottom: 18 },
  dayTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  dayCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
  },
  mealRow: {
    borderLeftWidth: 3,
    borderRadius: 8,
    marginVertical: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  mealRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mealTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  mealTypeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  mealTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  notesBox: {
    marginTop: 8,
    paddingLeft: 4,
  },
  servingsText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 5,
  },
  notesText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
