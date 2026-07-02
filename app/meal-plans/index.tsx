import { useRef, useState } from "react";
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
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { VoiceInput, SpeakButton, speakText } from "@/components/VoiceInput";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, apiStream } from "@/lib/query-client";
import { aiErrorMessage, isAiDisabled } from "@/lib/ai-error-message";

interface MealPlanIngredient {
  name: string;
  quantity?: string;
  unit?: string;
}

interface MealPlanItem {
  id?: string;
  date: string;
  mealType: string;
  title: string;
  description?: string;
  servings?: number;
  ingredients?: MealPlanIngredient[];
  steps?: string[];
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

function buildNotes(description?: string, steps?: string[]): string | undefined {
  const parts: string[] = [];
  if (description && description.trim()) parts.push(description.trim());
  if (steps && steps.length > 0) {
    const recipe = steps
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    if (recipe) parts.push(`Ricetta:\n${recipe}`);
  }
  const joined = parts.join("\n\n");
  return joined ? joined : undefined;
}

const SPEECH_WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function buildPlanSpeech(title: string, items: MealPlanItem[]): string {
  const groups = new Map<string, MealPlanItem[]>();
  for (const item of items) {
    if (!groups.has(item.date)) groups.set(item.date, []);
    groups.get(item.date)!.push(item);
  }
  const dayParts = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meals]) => {
      const d = new Date(`${date}T00:00:00`);
      const dayName = isNaN(d.getTime()) ? date : SPEECH_WEEKDAYS[d.getDay()];
      const mealsText = meals
        .map((m) => `${getMealTypeLabel(m.mealType)}: ${m.title}`)
        .join(". ");
      return `${dayName}. ${mealsText}`;
    });
  return `Ecco il tuo ${title}. ${dayParts.join(". ")}`;
}

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0]!;
}

function isoToDisplay(iso: string): string {
  const p = iso.split("-");
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return "";
}

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1);
  const jsDay = firstDay.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function CalendarModal({ value, onSelect, onClose, colors }: {
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
  colors: any;
}) {
  const insets = useSafeAreaInsets();
  const initial = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const cells = buildMonthGrid(viewYear, viewMonth);
  const now = new Date();
  const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate());

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const pick = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(toIso(viewYear, viewMonth, day));
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.calOverlay} onPress={onClose}>
        <Pressable
          style={[styles.calCard, { backgroundColor: colors.background, marginBottom: insets.bottom + 12 }]}
          onPress={() => {}}
        >
          <View style={styles.calHeader}>
            <Pressable onPress={goPrev} hitSlop={10} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={[styles.calTitle, { color: colors.text }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <Pressable onPress={goNext} hitSlop={10} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.calWeekRow}>
            {WEEKDAY_LABELS.map(w => (
              <Text key={w} style={[styles.calWeekLabel, { color: colors.textSecondary }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={styles.calCell} />;
              const iso = toIso(viewYear, viewMonth, day);
              const isSelected = iso === value;
              const isToday = iso === todayIso;
              return (
                <Pressable key={iso} style={styles.calCell} onPress={() => pick(day)}>
                  <View style={[
                    styles.calDay,
                    isSelected && { backgroundColor: colors.primary },
                    !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                  ]}>
                    <Text style={[styles.calDayText, { color: isSelected ? "#FFFFFF" : colors.text }]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={[styles.calCloseBtn, { borderColor: colors.border }]}>
            <Text style={[styles.calCloseText, { color: colors.textSecondary }]}>Chiudi</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
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

type ThemeColors = ReturnType<typeof useTheme>["colors"];

function PreviewMealRow({ meal, colors }: { meal: MealPlanItem; colors: ThemeColors }) {
  const [expanded, setExpanded] = useState(false);
  const mealColor = getMealTypeColor(meal.mealType, colors.primary, colors.secondary);
  const recipeSteps = (meal.steps ?? []).map((s) => s.trim()).filter(Boolean);
  const hasRecipe = recipeSteps.length > 0;

  return (
    <View style={[styles.mealRow, { borderLeftColor: mealColor }]}>
      <Pressable
        onPress={() => {
          if (!hasRecipe) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((e) => !e);
        }}
        style={styles.mealRowHeader}
      >
        <View style={[styles.mealTypeBadge, { backgroundColor: mealColor + "20" }]}>
          <Text style={[styles.mealTypeText, { color: mealColor }]}>
            {getMealTypeLabel(meal.mealType)}
          </Text>
        </View>
        <Text style={[styles.mealTitle, { color: colors.text }]}>{meal.title}</Text>
        {hasRecipe && (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        )}
      </Pressable>
      {hasRecipe && expanded && (
        <View style={styles.recipeBox}>
          {meal.description ? (
            <Text style={[styles.recipeDescription, { color: colors.textSecondary }]}>
              {meal.description}
            </Text>
          ) : null}
          <Text style={[styles.recipeHeading, { color: colors.text }]}>Ricetta</Text>
          {recipeSteps.map((step, i) => (
            <View key={i} style={styles.recipeStepRow}>
              <Text style={[styles.recipeStepNum, { color: mealColor }]}>{i + 1}.</Text>
              <Text style={[styles.recipeStepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}
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
  const [weekStartInput, setWeekStartInput] = useState(() => isoToDisplay(getNextMonday()));
  const [showCalendar, setShowCalendar] = useState(false);

  const handleCalendarSelect = (iso: string) => {
    setWeekStart(iso);
    setWeekStartInput(isoToDisplay(iso));
  };
  const [diet, setDiet] = useState("");
  const [allergies, setAllergies] = useState("");
  const [voicePrefs, setVoicePrefs] = useState("");
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

  // Contatore degli stream: ogni nuova generazione lo incrementa, così gli
  // aggiornamenti (e la lettura vocale) di uno stream vecchio vengono ignorati.
  const streamSeqRef = useRef(0);

  const fetchMealPlanStream = async (opts?: { voiceNotes?: string; speak?: boolean }) => {
    if (!currentFamily || generating || generatingAlt) return;
    const seq = ++streamSeqRef.current;
    const isActive = () => streamSeqRef.current === seq;
    setGenerating(true);
    setAiPlans([]);
    setSelectedPlanIndex(0);
    setAiDisabledError(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const notes = (opts?.voiceNotes ?? voicePrefs).trim();
    const preferences: Record<string, string> = {};
    if (diet.trim()) preferences.diet = diet.trim();
    if (allergies.trim()) preferences.allergies = allergies.trim();
    if (notes) preferences.notes = notes;
    const body: any = { weekStartDate: weekStart };
    if (Object.keys(preferences).length > 0) body.preferences = preferences;

    const collectedItems: MealPlanItem[] = [];
    let doneTitle = "Piano Settimanale";
    let started = false;
    let streamErr = false;
    try {
      await apiStream(
        `/api/ai/${currentFamily.id}/weekly-meal-plan/stream`,
        body,
        (obj) => {
          if (!isActive()) return;
          if (obj?.type === "error") {
            streamErr = true;
          } else if (obj?.type === "items" && Array.isArray(obj.items)) {
            collectedItems.push(...(obj.items as MealPlanItem[]));
            if (!started) {
              started = true;
              setAiPlans([{ title: "Piano Settimanale", weekStartDate: weekStart, items: obj.items }]);
            } else {
              setAiPlans((prev) => {
                if (prev.length === 0) {
                  return [{ title: "Piano Settimanale", weekStartDate: weekStart, items: obj.items }];
                }
                const first = prev[0]!;
                return [{ ...first, items: [...first.items, ...obj.items] }, ...prev.slice(1)];
              });
            }
          } else if (obj?.type === "done") {
            if (obj.title) doneTitle = obj.title;
            setAiPlans((prev) => {
              if (prev.length === 0) return prev;
              const first = prev[0]!;
              return [
                { ...first, title: obj.title || first.title, weekStartDate: obj.weekStartDate || weekStart },
                ...prev.slice(1),
              ];
            });
          }
        }
      );
      if (!isActive()) return;
      if (streamErr) {
        if (opts?.speak) speakText("Non sono riuscita a generare il piano pasti. Riprova.");
        if (Platform.OS === "web") {
          window.alert("Impossibile generare il piano pasti.");
        } else {
          Alert.alert("Errore", "Impossibile generare il piano pasti.");
        }
        setAiPlans([]);
      } else if (opts?.speak && collectedItems.length > 0) {
        speakText(buildPlanSpeech(doneTitle, collectedItems));
      }
    } catch (err: any) {
      if (!isActive()) return;
      if (opts?.speak) speakText("Non sono riuscita a generare il piano pasti. Riprova.");
      if (isAiDisabled(err)) {
        setAiDisabledError(true);
      } else {
        const msg = aiErrorMessage(err, "Impossibile generare il piano pasti.");
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Errore", msg);
        }
      }
      setAiPlans([]);
    } finally {
      if (isActive()) setGenerating(false);
    }
  };

  const fetchAlternativeStream = async () => {
    if (!currentFamily || generating || generatingAlt) return;
    setGeneratingAlt(true);
    setAiDisabledError(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const preferences: Record<string, string> = {};
    if (diet.trim()) preferences.diet = diet.trim();
    if (allergies.trim()) preferences.allergies = allergies.trim();
    if (voicePrefs.trim()) preferences.notes = voicePrefs.trim();
    const body: any = { weekStartDate: weekStart, planVariant: 2 };
    if (Object.keys(preferences).length > 0) body.preferences = preferences;

    let started = false;
    let streamErr = false;
    try {
      await apiStream(
        `/api/ai/${currentFamily.id}/weekly-meal-plan/stream`,
        body,
        (obj) => {
          if (obj?.type === "error") {
            streamErr = true;
          } else if (obj?.type === "items" && Array.isArray(obj.items)) {
            if (!started) {
              started = true;
              setAiPlans((prev) => {
                const planA = prev[0]
                  ? { ...prev[0], title: "Piano A - Classico" }
                  : null;
                const planB = {
                  title: "Piano B - Creativo",
                  weekStartDate: weekStart,
                  items: obj.items as MealPlanItem[],
                };
                return planA ? [planA, planB] : [planB];
              });
              setSelectedPlanIndex(1);
            } else {
              setAiPlans((prev) => {
                if (prev.length < 2) return prev;
                const planB = prev[1]!;
                const updated = [...prev];
                updated[1] = { ...planB, items: [...planB.items, ...obj.items] };
                return updated;
              });
            }
          }
        }
      );
      if (streamErr) {
        if (Platform.OS === "web") {
          window.alert("Impossibile generare l'alternativa.");
        } else {
          Alert.alert("Errore", "Impossibile generare l'alternativa.");
        }
        setAiPlans((prev) => prev.slice(0, 1));
        setSelectedPlanIndex(0);
      }
    } catch (err: any) {
      if (isAiDisabled(err)) {
        setAiDisabledError(true);
      } else {
        const msg = aiErrorMessage(err, "Impossibile generare l'alternativa.");
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Errore", msg);
        }
      }
      setAiPlans((prev) => prev.slice(0, 1));
      setSelectedPlanIndex(0);
    } finally {
      setGeneratingAlt(false);
    }
  };

  const handleGenerate = () => fetchMealPlanStream();
  const handleGenerateAlternative = () => fetchAlternativeStream();

  // Dettatura completa: l'utente detta dieta, allergie e preferenze in una volta;
  // al rilascio si genera subito il piano e a fine generazione viene letto ad alta voce.
  const handleVoiceGenerate = (text: string) => {
    const spoken = text.trim();
    if (!spoken) return;
    setVoicePrefs(spoken);
    fetchMealPlanStream({ voiceNotes: spoken, speak: true });
  };

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
          notes: buildNotes(i.description, i.steps),
          ingredients: i.ingredients || null,
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
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCalendar(true);
            }}
            style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <Text style={[styles.textInput, styles.dateValueText, { color: weekStartInput ? colors.text : colors.textSecondary }]}>
              {weekStartInput || "Seleziona data"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>

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

          {currentFamily ? (
            <View style={[styles.voiceCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <View style={styles.voiceCardRow}>
                <View style={styles.voiceCardTextBox}>
                  <Text style={[styles.voiceCardTitle, { color: colors.text }]}>
                    Detta e genera
                  </Text>
                  <Text style={[styles.voiceCardHint, { color: colors.textSecondary }]}>
                    Tieni premuto il microfono e detta dieta, allergie e preferenze. Al rilascio genero il piano e te lo leggo.
                  </Text>
                </View>
                <VoiceInput
                  familyId={currentFamily.id}
                  size={28}
                  onTranscribed={handleVoiceGenerate}
                  disabled={generating || generatingAlt}
                />
              </View>
              {voicePrefs ? (
                <View style={[styles.voicePrefsBox, { borderColor: colors.border }]}>
                  <Text style={[styles.voicePrefsText, { color: colors.text }]} numberOfLines={3}>
                    "{voicePrefs}"
                  </Text>
                  <Pressable onPress={() => setVoicePrefs("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

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

              <View style={styles.resultTitleRow}>
                <Text style={[styles.resultTitle, { color: colors.text, flex: 1 }]}>{currentPlan.title}</Text>
                <SpeakButton
                  text={[
                    currentPlan.title,
                    ...groupedItems.map(
                      (g) =>
                        `${formatDayDate(g.date)}: ${g.items
                          .map((m) => `${getMealTypeLabel(m.mealType)}, ${m.title}`)
                          .join(". ")}`
                    ),
                  ].join(". ")}
                />
              </View>
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
                  {group.items.map((meal, idx) => (
                    <PreviewMealRow
                      key={`${group.date}-${meal.mealType}-${idx}`}
                      meal={meal}
                      colors={colors}
                    />
                  ))}
                </View>
              ))}

              {!generating && (
              <>
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
              </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {showCalendar && (
        <CalendarModal
          value={weekStart}
          onSelect={handleCalendarSelect}
          onClose={() => setShowCalendar(false)}
          colors={colors}
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
  dateValueText: {
    height: undefined,
    lineHeight: 20,
  },
  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  calCard: {
    borderRadius: 20,
    padding: 16,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calNavBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  calTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  calWeekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  calWeekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  calDay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  calCloseBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  calCloseText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
  voiceCard: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  voiceCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  voiceCardTextBox: {
    flex: 1,
  },
  voiceCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  voiceCardHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  voicePrefsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  voicePrefsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
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
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    borderLeftWidth: 3,
    marginLeft: 8,
    marginBottom: 4,
  },
  mealRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  recipeBox: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
    gap: 6,
  },
  recipeDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    marginBottom: 4,
  },
  recipeHeading: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  recipeStepRow: {
    flexDirection: "row",
    gap: 8,
  },
  recipeStepNum: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    minWidth: 18,
  },
  recipeStepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
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
