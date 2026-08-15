import { useState } from "react";
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
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";

interface PlanItem {
  id: string;
  date: string;
  mealType: string;
  recipeId?: string | null;
  recipeTitle?: string | null;
  titleOverride?: string | null;
  notes?: string | null;
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

function MealRow({ item, colors }: { item: PlanItem; colors: ReturnType<typeof useTheme>["colors"] }) {
  const [expanded, setExpanded] = useState(false);
  const mealColor = getMealTypeColor(item.mealType, colors.primary, colors.secondary);
  const title = item.titleOverride || item.recipeTitle || "Pasto";
  const notes = (item.notes ?? "").trim();
  const hasNotes = notes.length > 0;

  return (
    <View style={[styles.mealRow, { borderLeftColor: mealColor }]}>
      <Pressable
        onPress={() => {
          if (!hasNotes) return;
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
        {hasNotes && (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        )}
      </Pressable>
      {hasNotes && expanded && (
        <View style={styles.notesBox}>
          <Text style={[styles.notesText, { color: colors.textSecondary }]}>{notes}</Text>
        </View>
      )}
    </View>
  );
}

export default function MealPlanViewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const params = useLocalSearchParams<{ planId?: string }>();
  const planId = typeof params.planId === "string" && params.planId ? params.planId : null;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const planQuery = useQuery<PlanDetail>({
    queryKey: ["/api/meal-plans", currentFamily?.id, "meal-plans", planId],
    enabled: !!currentFamily?.id && !!planId,
  });

  const plan = planQuery.data ?? null;

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
                  <MealRow key={item.id} item={item} colors={colors} />
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
  notesText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
