import { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
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
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";

interface MealPlanItem {
  id?: string;
  date: string;
  mealType: string;
  title: string;
  description?: string;
  servings?: number;
}

interface MealPlan {
  id: string;
  familyId: string;
  title: string;
  weekStartDate: string;
  items: MealPlanItem[];
  createdAt: string;
}

interface AiMealPlanResponse {
  title: string;
  weekStartDate: string;
  items: MealPlanItem[];
}

type TabKey = "plans" | "generate";

const TAB_CONFIG: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "plans", label: "I Miei Piani", icon: "calendar" },
  { key: "generate", label: "Genera con AI", icon: "sparkles" },
];

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0]!;
}

function formatWeekDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `Settimana del ${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getMealTypeLabel(mealType: string): string {
  switch (mealType) {
    case "breakfast":
      return "Colazione";
    case "lunch":
      return "Pranzo";
    case "dinner":
      return "Cena";
    case "snack":
      return "Spuntino";
    default:
      return mealType;
  }
}

function getMealTypeColor(mealType: string, colors: any): string {
  switch (mealType) {
    case "breakfast":
      return "#FFB74D";
    case "lunch":
      return colors.secondary;
    case "dinner":
      return colors.primary;
    case "snack":
      return "#A29BFE";
    default:
      return colors.textSecondary;
  }
}

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
    try {
      body = await res.json();
    } catch {
      try {
        await res.text();
      } catch {}
    }
    throw { status: res.status, body };
  }
  return res.json();
}

export default function MealPlansScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("plans");
  const [weekStart, setWeekStart] = useState(getNextMonday);
  const [diet, setDiet] = useState("");
  const [allergies, setAllergies] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiResult, setAiResult] = useState<AiMealPlanResponse | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const plansQuery = useQuery<MealPlan[]>({
    queryKey: ["/api/meal-plans", currentFamily?.id, "meal-plans"],
    enabled: !!currentFamily?.id,
  });

  const plans = plansQuery.data || [];

  const handleToShoppingList = async (planId: string) => {
    if (!currentFamily) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("POST", `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/to-shopping-list`);
      Alert.alert("Lista creata", "La lista della spesa e stata creata dal piano pasti.");
      qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamily.id, "lists"] });
    } catch (error) {
      Alert.alert("Errore", "Impossibile creare la lista della spesa.");
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!currentFamily) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("DELETE", `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}`);
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
    } catch (error) {
      Alert.alert("Errore", "Impossibile eliminare il piano.");
    }
  };

  const handleGenerate = async () => {
    if (!currentFamily) return;
    setGenerating(true);
    setAiResult(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const body: any = { weekStartDate: weekStart };
      if (diet.trim()) body.diet = diet.trim();
      if (allergies.trim()) body.allergies = allergies.trim();
      const result = await fetchAiJson<AiMealPlanResponse>(
        `/api/ai/${currentFamily.id}/weekly-meal-plan`,
        { method: "POST", body }
      );
      setAiResult(result);
    } catch (error) {
      Alert.alert("Errore", "Impossibile generare il piano pasti.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePlan = async () => {
    if (!currentFamily || !aiResult) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiRequest("POST", `/api/meal-plans/${currentFamily.id}/meal-plans`, {
        title: aiResult.title,
        weekStartDate: aiResult.weekStartDate,
        items: aiResult.items,
      });
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
      setAiResult(null);
      setActiveTab("plans");
      Alert.alert("Salvato", "Il piano pasti e stato salvato.");
    } catch (error) {
      Alert.alert("Errore", "Impossibile salvare il piano.");
    } finally {
      setSaving(false);
    }
  };

  const groupedItems = useMemo(() => {
    if (!aiResult?.items) return [];
    const groups = new Map<string, MealPlanItem[]>();
    for (const item of aiResult.items) {
      const key = item.date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items }));
  }, [aiResult]);

  const formatDayDate = (dateStr: string): string => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const renderPlanItem = ({ item }: { item: MealPlan }) => (
    <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.planHeader}>
        <View style={styles.planInfo}>
          <Text style={[styles.planTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.planDate, { color: colors.textSecondary }]}>
            {formatWeekDate(item.weekStartDate)}
          </Text>
          <Text style={[styles.planCount, { color: colors.textSecondary }]}>
            {item.items?.length || 0} pasti
          </Text>
        </View>
        <View style={styles.planActions}>
          <Pressable
            onPress={() => handleToShoppingList(item.id)}
            hitSlop={8}
            style={styles.actionButton}
          >
            <Ionicons name="cart-outline" size={22} color={colors.secondary} />
          </Pressable>
          <Pressable
            onPress={() => handleDeletePlan(item.id)}
            hitSlop={8}
            style={styles.actionButton}
          >
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Piano Pasti</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TAB_CONFIG.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.key);
            }}
            style={[
              styles.tabItem,
              activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={activeTab === tab.key ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: activeTab === tab.key ? colors.primary : colors.textSecondary,
                  fontFamily: activeTab === tab.key ? "Inter_600SemiBold" : "Inter_500Medium",
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "plans" && (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          renderItem={renderPlanItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 20 }]}
          scrollEnabled={plans.length > 0}
          ListEmptyComponent={
            plansQuery.isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="restaurant-outline"
                title="Nessun piano pasti"
                subtitle="Genera un piano settimanale con l'AI nella scheda apposita"
              />
            )
          }
        />
      )}

      {activeTab === "generate" && (
        <ScrollView
          style={styles.generateContainer}
          contentContainerStyle={[styles.generateContent, { paddingBottom: bottomInset + 20 }]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Data inizio settimana</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              value={weekStart}
              onChangeText={setWeekStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>Dieta (opzionale)</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="leaf-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              value={diet}
              onChangeText={setDiet}
              placeholder="Es. vegetariana, mediterranea..."
              placeholderTextColor={colors.textSecondary}
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>Allergie (opzionale)</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="warning-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              value={allergies}
              onChangeText={setAllergies}
              placeholder="Es. glutine, lattosio..."
              placeholderTextColor={colors.textSecondary}
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={({ pressed }) => [
              styles.generateButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
              generating && { opacity: 0.6 },
            ]}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>Genera Piano</Text>
              </>
            )}
          </Pressable>

          {aiResult && (
            <View style={styles.resultSection}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>{aiResult.title}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                {formatWeekDate(aiResult.weekStartDate)}
              </Text>

              {groupedItems.map((group) => (
                <View key={group.date} style={styles.dayGroup}>
                  <View style={[styles.dayHeader, { backgroundColor: colors.primary + "12" }]}>
                    <Ionicons name="calendar" size={16} color={colors.primary} />
                    <Text style={[styles.dayHeaderText, { color: colors.primary }]}>
                      {formatDayDate(group.date)}
                    </Text>
                  </View>
                  {group.items.map((meal, idx) => (
                    <View
                      key={`${group.date}-${meal.mealType}-${idx}`}
                      style={[styles.mealRow, { borderLeftColor: getMealTypeColor(meal.mealType, colors) }]}
                    >
                      <View
                        style={[
                          styles.mealTypeBadge,
                          { backgroundColor: getMealTypeColor(meal.mealType, colors) + "20" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.mealTypeText,
                            { color: getMealTypeColor(meal.mealType, colors) },
                          ]}
                        >
                          {getMealTypeLabel(meal.mealType)}
                        </Text>
                      </View>
                      <Text style={[styles.mealTitle, { color: colors.text }]}>{meal.title}</Text>
                    </View>
                  ))}
                </View>
              ))}

              <Pressable
                onPress={handleSavePlan}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: colors.success },
                  pressed && { opacity: 0.85 },
                  saving && { opacity: 0.6 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>Salva Piano</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  planCard: {
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  planInfo: {
    flex: 1,
    gap: 4,
  },
  planTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  planDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  planCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  planActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  generateContainer: {
    flex: 1,
  },
  generateContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
    marginTop: 16,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 48,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 14,
    marginTop: 24,
    gap: 8,
  },
  generateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  resultSection: {
    marginTop: 28,
  },
  resultTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  resultSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  dayGroup: {
    marginBottom: 16,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 8,
  },
  dayHeaderText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    marginLeft: 8,
    marginBottom: 4,
    gap: 10,
  },
  mealTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mealTypeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mealTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 14,
    marginTop: 24,
    gap: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
