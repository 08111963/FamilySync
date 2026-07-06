import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";

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

interface RecipeOption {
  id: string;
  title: string;
}

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;

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

const WEEKDAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return toLocalIso(d);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function isoToDisplay(iso: string): string {
  const p = iso.split("-");
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return iso;
}

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
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
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
            {WEEKDAY_LABELS.map((w) => (
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

interface MealDraft {
  itemId: string | null;
  date: string;
  mealType: string;
  recipeId: string | null;
  titleOverride: string;
  notes: string;
}

export default function MealPlanEditScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ planId?: string }>();

  const [planId, setPlanId] = useState<string | null>(
    typeof params.planId === "string" && params.planId ? params.planId : null
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // --- Creazione nuovo piano ---
  const [newTitle, setNewTitle] = useState("");
  const [weekStart, setWeekStart] = useState(getNextMonday);
  const [showCalendar, setShowCalendar] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- Editor pasti ---
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const planQuery = useQuery<PlanDetail>({
    queryKey: ["/api/meal-plans", currentFamily?.id, "meal-plans", planId],
    enabled: !!currentFamily?.id && !!planId,
  });

  const recipesQuery = useQuery<RecipeOption[]>({
    queryKey: ["/api/recipes", currentFamily?.id, "recipes"],
    enabled: !!currentFamily?.id,
  });

  const plan = planQuery.data;
  const recipes = recipesQuery.data || [];

  const invalidatePlan = () => {
    if (!currentFamily) return;
    qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
    if (planId) {
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans", planId] });
    }
  };

  const handleCreatePlan = async () => {
    if (!currentFamily || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await apiRequest("POST", `/api/meal-plans/${currentFamily.id}/meal-plans`, {
        title: newTitle.trim() || "Piano Settimanale",
        weekStartDate: weekStart,
        items: [],
      });
      const created = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
      setPlanId(created.id);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("PLAN_EXISTS") || msg.includes("409")) {
        setCreateError("Esiste già un piano per questa settimana. Scegli un'altra data o modifica quello esistente.");
      } else {
        setCreateError("Errore nella creazione del piano. Riprova.");
      }
    } finally {
      setCreating(false);
    }
  };

  const openAddMeal = (date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItemError(null);
    setDraft({ itemId: null, date, mealType: "lunch", recipeId: null, titleOverride: "", notes: "" });
  };

  const openEditMeal = (item: PlanItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItemError(null);
    setDraft({
      itemId: item.id,
      date: item.date,
      mealType: item.mealType,
      recipeId: item.recipeId ?? null,
      titleOverride: item.titleOverride ?? "",
      notes: item.notes ?? "",
    });
  };

  const handleSaveMeal = async () => {
    if (!currentFamily || !planId || !draft || savingItem) return;
    const text = draft.titleOverride.trim();
    if (!draft.recipeId && !text) {
      setItemError("Scegli una ricetta oppure scrivi il nome del pasto.");
      return;
    }
    setSavingItem(true);
    setItemError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const payload = {
        date: draft.date,
        mealType: draft.mealType,
        recipeId: draft.recipeId,
        titleOverride: text || null,
        notes: draft.notes.trim() || null,
      };
      if (draft.itemId) {
        await apiRequest(
          "PUT",
          `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/items/${draft.itemId}`,
          payload
        );
      } else {
        await apiRequest(
          "POST",
          `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/items`,
          payload
        );
      }
      invalidatePlan();
      setDraft(null);
    } catch {
      setItemError("Errore nel salvataggio del pasto. Riprova.");
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteMeal = async (item: PlanItem) => {
    if (!currentFamily || !planId || deletingIds.has(item.id)) return;
    const doDelete = async () => {
      setDeletingIds((prev) => new Set(prev).add(item.id));
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await apiRequest(
          "DELETE",
          `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/items/${item.id}`
        );
        invalidatePlan();
      } catch {
        if (Platform.OS === "web") window.alert("Impossibile rimuovere il pasto.");
        else Alert.alert("Errore", "Impossibile rimuovere il pasto.");
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    };
    const title = item.titleOverride || item.recipeTitle || "questo pasto";
    if (Platform.OS === "web") {
      if (window.confirm(`Rimuovere "${title}"?`)) await doDelete();
    } else {
      Alert.alert("Rimuovi pasto", `Rimuovere "${title}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Rimuovi", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleSaveTitle = async () => {
    if (!currentFamily || !planId) return;
    const t = titleDraft.trim();
    if (!t || t === plan?.title) {
      setEditingTitle(false);
      return;
    }
    try {
      await apiRequest("PUT", `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}`, { title: t });
      invalidatePlan();
    } catch {
      if (Platform.OS === "web") window.alert("Impossibile rinominare il piano.");
      else Alert.alert("Errore", "Impossibile rinominare il piano.");
    } finally {
      setEditingTitle(false);
    }
  };

  const weekDays: string[] = plan
    ? Array.from({ length: 7 }, (_, i) => addDays(plan.weekStartDate, i))
    : [];

  const itemsByDate = new Map<string, PlanItem[]>();
  if (plan?.items) {
    for (const item of plan.items) {
      if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
      itemsByDate.get(item.date)!.push(item);
    }
    for (const list of itemsByDate.values()) {
      list.sort(
        (a, b) =>
          MEAL_TYPES.indexOf(a.mealType as any) - MEAL_TYPES.indexOf(b.mealType as any)
      );
    }
  }

  // ---------- Schermata creazione ----------
  if (!planId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topInset + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Nuovo Piano Pasti</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.createContent, { paddingBottom: bottomInset + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.infoBox, { backgroundColor: colors.primary + "12" }]}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Crea un piano pasti manualmente, ad esempio quello del nutrizionista. Dopo la creazione potrai aggiungere i pasti giorno per giorno.
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Nome del piano</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholder="es. Piano del nutrizionista"
            placeholderTextColor={colors.textSecondary}
            value={newTitle}
            onChangeText={setNewTitle}
            testID="input-plan-title"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Settimana che inizia il</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCalendar(true);
            }}
            style={[styles.input, styles.dateInput, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="button-pick-week"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: colors.text }]}>{isoToDisplay(weekStart)}</Text>
          </Pressable>

          {createError ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
              <Ionicons name="warning-outline" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{createError}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleCreatePlan}
            disabled={creating}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed || creating ? 0.7 : 1 },
            ]}
            testID="button-create-plan"
          >
            {creating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.primaryButtonText}>
              {creating ? "Creazione..." : "Crea piano"}
            </Text>
          </Pressable>
        </ScrollView>

        {showCalendar && (
          <CalendarModal
            value={weekStart}
            onSelect={setWeekStart}
            onClose={() => setShowCalendar(false)}
            colors={colors}
          />
        )}
      </View>
    );
  }

  // ---------- Editor piano ----------
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Modifica Piano
        </Text>
        <View style={styles.headerButton} />
      </View>

      {planQuery.isError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error, marginTop: 8, textAlign: "center" }]}>
            Piano non trovato o non disponibile.
          </Text>
        </View>
      ) : planQuery.isLoading || !plan ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.editorContent, { paddingBottom: bottomInset + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.planTitleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {editingTitle ? (
              <View style={styles.titleEditRow}>
                <TextInput
                  style={[styles.titleInput, { color: colors.text, borderColor: colors.border }]}
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  autoFocus
                  onSubmitEditing={handleSaveTitle}
                  testID="input-edit-plan-title"
                />
                <Pressable onPress={handleSaveTitle} hitSlop={8}>
                  <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.titleEditRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: colors.text }]}>{plan.title}</Text>
                  <Text style={[styles.planDate, { color: colors.textSecondary }]}>
                    Settimana del {isoToDisplay(plan.weekStartDate)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTitleDraft(plan.title);
                    setEditingTitle(true);
                  }}
                  hitSlop={8}
                  testID="button-edit-plan-title"
                >
                  <Ionicons name="pencil" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            )}
          </View>

          {weekDays.map((date) => {
            const dayItems = itemsByDate.get(date) || [];
            return (
              <View key={date} style={styles.daySection}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayTitle, { color: colors.text }]}>{dayLabel(date)}</Text>
                  <Pressable
                    onPress={() => openAddMeal(date)}
                    hitSlop={8}
                    testID={`button-add-meal-${date}`}
                  >
                    <Ionicons name="add-circle" size={26} color={colors.primary} />
                  </Pressable>
                </View>
                {dayItems.length === 0 ? (
                  <Text style={[styles.dayEmpty, { color: colors.textSecondary }]}>
                    Nessun pasto — tocca + per aggiungerne uno
                  </Text>
                ) : (
                  dayItems.map((item) => {
                    const mealColor = getMealTypeColor(item.mealType, colors.primary, colors.secondary);
                    const title = item.titleOverride || item.recipeTitle || "Pasto";
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => openEditMeal(item)}
                        style={({ pressed }) => [
                          styles.mealRow,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            borderLeftColor: mealColor,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                        testID={`meal-item-${item.id}`}
                      >
                        <View style={[styles.mealTypeBadge, { backgroundColor: mealColor + "20" }]}>
                          <Text style={[styles.mealTypeText, { color: mealColor }]}>
                            {getMealTypeLabel(item.mealType)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.mealTitle, { color: colors.text }]} numberOfLines={1}>
                            {title}
                          </Text>
                          {item.recipeId && item.recipeTitle && item.titleOverride ? (
                            <Text style={[styles.mealSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                              Ricetta: {item.recipeTitle}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDeleteMeal(item);
                          }}
                          hitSlop={8}
                          disabled={deletingIds.has(item.id)}
                        >
                          {deletingIds.has(item.id) ? (
                            <ActivityIndicator size="small" color={colors.error} />
                          ) : (
                            <Ionicons name="trash-outline" size={18} color={colors.error} />
                          )}
                        </Pressable>
                      </Pressable>
                    );
                  })
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {draft && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setDraft(null)}>
          <KeyboardAvoidingView
            style={styles.sheetOverlay}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable style={{ flex: 1 }} onPress={() => setDraft(null)} />
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.background, paddingBottom: bottomInset + 20 },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {draft.itemId ? "Modifica pasto" : "Aggiungi pasto"}
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                {dayLabel(draft.date)}
              </Text>

              <ScrollView
                style={{ maxHeight: 420 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.label, { color: colors.textSecondary }]}>Tipo di pasto</Text>
                <View style={styles.chipRow}>
                  {MEAL_TYPES.map((mt) => {
                    const selected = draft.mealType === mt;
                    const mealColor = getMealTypeColor(mt, colors.primary, colors.secondary);
                    return (
                      <Pressable
                        key={mt}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setDraft((d) => (d ? { ...d, mealType: mt } : d));
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? mealColor : colors.surface,
                            borderColor: selected ? mealColor : colors.border,
                          },
                        ]}
                        testID={`chip-meal-type-${mt}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? "#FFFFFF" : colors.textSecondary },
                          ]}
                        >
                          {getMealTypeLabel(mt)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.label, { color: colors.textSecondary }]}>Nome del pasto</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="es. Petto di pollo con verdure"
                  placeholderTextColor={colors.textSecondary}
                  value={draft.titleOverride}
                  onChangeText={(v) => setDraft((d) => (d ? { ...d, titleOverride: v } : d))}
                  testID="input-meal-title"
                />

                {recipes.length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                      Oppure scegli una ricetta salvata
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.recipeChipRow}
                    >
                      {recipes.map((r) => {
                        const selected = draft.recipeId === r.id;
                        return (
                          <Pressable
                            key={r.id}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setDraft((d) =>
                                d ? { ...d, recipeId: selected ? null : r.id } : d
                              );
                            }}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: selected ? colors.primary : colors.surface,
                                borderColor: selected ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                { color: selected ? "#FFFFFF" : colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {r.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={[styles.label, { color: colors.textSecondary }]}>Note</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                  placeholder="es. 150g, condire con olio a crudo"
                  placeholderTextColor={colors.textSecondary}
                  value={draft.notes}
                  onChangeText={(v) => setDraft((d) => (d ? { ...d, notes: v } : d))}
                  multiline
                  testID="input-meal-notes"
                />

                {itemError ? (
                  <View style={[styles.errorBanner, { backgroundColor: colors.error + "15" }]}>
                    <Ionicons name="warning-outline" size={16} color={colors.error} />
                    <Text style={[styles.errorText, { color: colors.error }]}>{itemError}</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => setDraft(null)}
                  style={[styles.secondaryButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                    Annulla
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveMeal}
                  disabled={savingItem}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.sheetSaveButton,
                    { backgroundColor: colors.primary, opacity: pressed || savingItem ? 0.7 : 1 },
                  ]}
                  testID="button-save-meal"
                >
                  {savingItem ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.primaryButtonText}>Salva</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
  loadingContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  createContent: {
    paddingHorizontal: 20,
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 20,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  editorContent: {
    paddingHorizontal: 20,
  },
  planTitleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  titleEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleInput: {
    flex: 1,
    borderBottomWidth: 1,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    paddingVertical: 4,
  },
  planTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  planDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  daySection: {
    marginBottom: 18,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  dayEmpty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  mealTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mealTypeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mealTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  mealSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  sheetSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recipeChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    marginTop: 20,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sheetSaveButton: {
    flex: 1,
  },
  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  calCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calNavBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  calTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  calWeekRow: {
    flexDirection: "row",
    marginBottom: 4,
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
    width: "14.2857%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  calDay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  calDayText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  calCloseBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 10,
  },
  calCloseText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
