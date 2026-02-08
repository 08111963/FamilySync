import { useState } from "react";
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

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, apiFetch } from "@/lib/query-client";

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

interface AiMultiPlanResponse {
  plans: AiMealPlanResponse[];
}

type TabKey = "plans" | "generate";

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


function PlanCard({
  plan,
  onToShoppingList,
  onDelete,
}: {
  plan: MealPlan;
  onToShoppingList: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.planHeader}>
        <View style={styles.planInfo}>
          <Text style={[styles.planTitle, { color: colors.text }]}>{plan.title}</Text>
          <Text style={[styles.planDate, { color: colors.textSecondary }]}>
            {formatWeekDate(plan.weekStartDate)}
          </Text>
          <Text style={[styles.planCount, { color: colors.textSecondary }]}>
            {plan.items?.length || 0} pasti
          </Text>
        </View>
        <View style={styles.planActions}>
          <Pressable onPress={() => onToShoppingList(plan.id)} hitSlop={8} style={styles.actionButton}>
            <Ionicons name="cart-outline" size={22} color={colors.secondary} />
          </Pressable>
          <Pressable onPress={() => onDelete(plan.id)} hitSlop={8} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>
    </View>
  );
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
  const [aiPlans, setAiPlans] = useState<AiMealPlanResponse[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

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
      if (Platform.OS === "web") {
        window.alert("La lista della spesa e stata creata dal piano pasti.");
      } else {
        Alert.alert("Lista creata", "La lista della spesa e stata creata dal piano pasti.");
      }
      qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamily.id, "lists"] });
    } catch {
      if (Platform.OS === "web") {
        window.alert("Impossibile creare la lista della spesa.");
      } else {
        Alert.alert("Errore", "Impossibile creare la lista della spesa.");
      }
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!currentFamily) return;
    const doDelete = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await apiRequest("DELETE", `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}`);
        qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
      } catch {
        if (Platform.OS === "web") {
          window.alert("Impossibile eliminare il piano.");
        } else {
          Alert.alert("Errore", "Impossibile eliminare il piano.");
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Vuoi eliminare questo piano pasti?")) {
        await doDelete();
      }
    } else {
      Alert.alert("Elimina piano", "Vuoi eliminare questo piano pasti?", [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const [generatingAlt, setGeneratingAlt] = useState(false);
  const [aiDisabledError, setAiDisabledError] = useState(false);

  const fetchMealPlans = async (variants: 1 | 2) => {
    if (!currentFamily) return;
    const isAlt = variants === 2;
    if (isAlt) {
      setGeneratingAlt(true);
    } else {
      setGenerating(true);
      setAiPlans([]);
    }
    setSelectedPlanIndex(0);
    setAiDisabledError(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const preferences: Record<string, string> = {};
      if (diet.trim()) preferences.diet = diet.trim();
      if (allergies.trim()) preferences.allergies = allergies.trim();
      const body: any = { weekStartDate: weekStart, variants };
      if (Object.keys(preferences).length > 0) body.preferences = preferences;
      const result = await apiFetch<AiMultiPlanResponse>(
        `/api/ai/${currentFamily.id}/weekly-meal-plan`,
        { method: "POST", body }
      );
      if (result.plans && result.plans.length > 0) {
        setAiPlans(result.plans);
      }
    } catch (err: any) {
      let isAiDisabled = false;
      try {
        const msg = err?.message || '';
        if (msg.includes('403') || msg.includes('AI_DISABLED')) {
          const jsonPart = msg.split(': ').slice(1).join(': ');
          if (jsonPart) {
            const parsed = JSON.parse(jsonPart);
            if (parsed?.error?.code === 'AI_DISABLED') isAiDisabled = true;
          }
          if (!isAiDisabled && msg.includes('403')) isAiDisabled = true;
        }
      } catch {}
      if (isAiDisabled) {
        setAiDisabledError(true);
      } else {
        if (Platform.OS === "web") {
          window.alert("Impossibile generare il piano pasti.");
        } else {
          Alert.alert("Errore", "Impossibile generare il piano pasti.");
        }
      }
    } finally {
      setGenerating(false);
      setGeneratingAlt(false);
    }
  };

  const handleGenerate = () => fetchMealPlans(1);
  const handleGenerateAlternative = () => fetchMealPlans(2);

  const handleSavePlan = async () => {
    const chosenPlan = aiPlans[selectedPlanIndex];
    if (!currentFamily || !chosenPlan) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiRequest("POST", `/api/meal-plans/${currentFamily.id}/meal-plans`, {
        title: chosenPlan.title,
        weekStartDate: chosenPlan.weekStartDate ?? weekStart,
        items: chosenPlan.items.map((i) => ({
          date: i.date,
          mealType: i.mealType,
          titleOverride: i.title,
          notes: i.description,
        })),
      });
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
      setAiPlans([]);
      setActiveTab("plans");
    } catch {
      if (Platform.OS === "web") {
        window.alert("Impossibile salvare il piano.");
      } else {
        Alert.alert("Errore", "Impossibile salvare il piano.");
      }
    } finally {
      setSaving(false);
    }
  };

  const currentPlan = aiPlans[selectedPlanIndex] ?? null;
  const groupedItems: { date: string; items: MealPlanItem[] }[] = [];
  if (currentPlan?.items) {
    const groups = new Map<string, MealPlanItem[]>();
    for (const item of currentPlan.items) {
      if (!groups.has(item.date)) groups.set(item.date, []);
      groups.get(item.date)!.push(item);
    }
    Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, items]) => groupedItems.push({ date, items }));
  }

  const formatDayDate = (dateStr: string): string => {
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Piano Pasti</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("plans");
          }}
          style={[
            styles.tabItem,
            activeTab === "plans" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
        >
          <Ionicons name="calendar" size={18} color={activeTab === "plans" ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabLabel, { color: activeTab === "plans" ? colors.primary : colors.textSecondary, fontFamily: activeTab === "plans" ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
            I Miei Piani
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("generate");
          }}
          style={[
            styles.tabItem,
            activeTab === "generate" && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
        >
          <Ionicons name="sparkles" size={18} color={activeTab === "generate" ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabLabel, { color: activeTab === "generate" ? colors.primary : colors.textSecondary, fontFamily: activeTab === "generate" ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
            Genera con AI
          </Text>
        </Pressable>
      </View>

      {activeTab === "plans" && (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlanCard plan={item} onToShoppingList={handleToShoppingList} onDelete={handleDeletePlan} />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 20 }]}
          scrollEnabled={plans.length > 0}
          ListEmptyComponent={
            plansQuery.isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.border }]}>
                  <Ionicons name="restaurant-outline" size={32} color={colors.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessun piano pasti</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Genera un piano settimanale con l'AI nella scheda apposita
                </Text>
              </View>
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

          {aiDisabledError && (
            <View style={[styles.aiDisabledBox, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}>
              <Ionicons name="warning-outline" size={20} color={colors.error} />
              <Text style={[styles.aiDisabledText, { color: colors.error }]}>
                Funzionalità AI disabilitata. Attivala nelle Impostazioni.
              </Text>
            </View>
          )}

          {aiPlans.length > 0 && currentPlan && (
            <View style={styles.resultSection}>
              {aiPlans.length > 1 ? (
                <>
                  <Text style={[styles.planChoiceLabel, { color: colors.textSecondary }]}>
                    Scegli il piano che preferisci
                  </Text>
                  <View style={styles.planSelectorRow}>
                    {aiPlans.map((plan, idx) => {
                      const isActive = idx === selectedPlanIndex;
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedPlanIndex(idx);
                          }}
                          style={[
                            styles.planSelectorTab,
                            {
                              backgroundColor: isActive ? colors.primary : colors.surface,
                              borderColor: isActive ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={idx === 0 ? "restaurant" : "nutrition"}
                            size={18}
                            color={isActive ? "#FFFFFF" : colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.planSelectorText,
                              { color: isActive ? "#FFFFFF" : colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {plan.title || `Piano ${idx + 1}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={[styles.resultTitle, { color: colors.text }]}>{currentPlan.title}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                {formatWeekDate(currentPlan.weekStartDate ?? weekStart)}
              </Text>

              {groupedItems.map((group) => (
                <View key={group.date} style={styles.dayGroup}>
                  <View style={[styles.dayHeader, { backgroundColor: colors.primary + "12" }]}>
                    <Ionicons name="calendar" size={16} color={colors.primary} />
                    <Text style={[styles.dayHeaderText, { color: colors.primary }]}>
                      {formatDayDate(group.date)}
                    </Text>
                  </View>
                  {group.items.map((meal, idx) => {
                    const mealColor = getMealTypeColor(meal.mealType, colors.primary, colors.secondary);
                    return (
                      <View
                        key={`${group.date}-${meal.mealType}-${idx}`}
                        style={[styles.mealRow, { borderLeftColor: mealColor }]}
                      >
                        <View style={[styles.mealTypeBadge, { backgroundColor: mealColor + "20" }]}>
                          <Text style={[styles.mealTypeText, { color: mealColor }]}>
                            {getMealTypeLabel(meal.mealType)}
                          </Text>
                        </View>
                        <Text style={[styles.mealTitle, { color: colors.text }]}>{meal.title}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={styles.resultActions}>
                <Pressable
                  onPress={handleSavePlan}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: colors.success, flex: 1 },
                    pressed && { opacity: 0.85 },
                    saving && { opacity: 0.6 },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.saveButtonText}>Salva questo piano</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {aiPlans.length === 1 && (
                <Pressable
                  onPress={handleGenerateAlternative}
                  disabled={generatingAlt}
                  style={({ pressed }) => [
                    styles.altButton,
                    { borderColor: colors.primary },
                    pressed && { opacity: 0.7 },
                    generatingAlt && { opacity: 0.5 },
                  ]}
                >
                  {generatingAlt ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
                      <Text style={[styles.altButtonText, { color: colors.primary }]}>
                        Genera alternativa
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setAiPlans([]);
                  setSelectedPlanIndex(0);
                }}
                style={({ pressed }) => [
                  styles.discardButton,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.discardButtonText, { color: colors.textSecondary }]}>
                  Scarta e rigenera
                </Text>
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
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
  planChoiceLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginBottom: 12,
  },
  planSelectorRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  planSelectorTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
  },
  planSelectorText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  resultActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 14,
    gap: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  discardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    gap: 6,
  },
  discardButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  altButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 10,
    gap: 6,
  },
  altButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  aiDisabledBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  aiDisabledText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
