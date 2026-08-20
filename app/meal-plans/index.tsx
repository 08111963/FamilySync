import { useEffect, useRef, useState } from "react";
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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import AiPrivacyNotice from "@/components/AiPrivacyNotice";
import { useTheme } from "@/hooks/useTheme";
import { VoiceInput, SpeakButton, speakText, primeSpeech } from "@/components/VoiceInput";
import { useAutoSpeak } from "@/hooks/useAutoSpeak";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest, apiStream, getApiErrorMessage } from "@/lib/query-client";
import { freeLimitMessage } from "@/lib/plan-limit";
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
  items?: MealPlanItem[];
  itemCount?: number;
  createdAt: string;
}

interface AiMealPlanResponse {
  title: string;
  weekStartDate: string;
  items: MealPlanItem[];
  preferences?: {
    diet?: string;
    allergies?: string;
    notes?: string;
  };
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  onOpen,
  onToShoppingList,
  onDelete,
  onEdit,
}: {
  plan: MealPlan;
  onOpen: (id: string) => void;
  onToShoppingList: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.planHeader}>
        <Pressable
          onPress={() => onOpen(plan.id)}
          style={({ pressed }) => [styles.planInfo, { opacity: pressed ? 0.6 : 1 }]}
          testID={`button-view-plan-${plan.id}`}
        >
          <Text style={[styles.planTitle, { color: colors.text }]}>{plan.title}</Text>
          <Text style={[styles.planDate, { color: colors.textSecondary }]}>
            {formatWeekDate(plan.weekStartDate)}
          </Text>
          <Text style={[styles.planCount, { color: colors.textSecondary }]}>
            {(plan.itemCount ?? plan.items?.length ?? 0) + " pasti · tocca per vedere"}
          </Text>
        </Pressable>
        <View style={styles.planActions}>
          <Pressable
            onPress={() => onEdit(plan.id)}
            hitSlop={8}
            style={styles.actionButton}
            testID={`button-edit-plan-${plan.id}`}
          >
            <Ionicons name="pencil" size={21} color={colors.primary} />
          </Pressable>
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
  const { autoSpeak, toggleAutoSpeak } = useAutoSpeak();
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
  // Preferenze passate dall'assistente AI della Home (es. "mediterraneo"):
  // precompilano le note, la generazione parte solo col pulsante "Genera Piano".
  const { notes: notesParam, assistant: assistantParam } = useLocalSearchParams<{ notes?: string; assistant?: string }>();
  const [voicePrefs, setVoicePrefs] = useState("");
  // Arrivo dall'assistente AI ("assistant=1"): l'utente HA GIÀ confermato in
  // chat, quindi apriamo la scheda "Genera con AI" e avviamo subito la
  // generazione (una sola volta), con le eventuali preferenze nelle note.
  // I parametri possono arrivare DOPO il primo render (soprattutto su web).
  const assistantAutoRunRef = useRef(false);
  useEffect(() => {
    const notes = typeof notesParam === "string" ? notesParam.trim().slice(0, 300) : "";
    if (notes) setVoicePrefs((prev) => (prev ? prev : notes));
    if (assistantParam === "1" || notes) setActiveTab("generate");
    if (assistantParam === "1" && currentFamily && !assistantAutoRunRef.current) {
      assistantAutoRunRef.current = true;
      fetchMealPlanStream(notes ? { voiceNotes: notes } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesParam, assistantParam, currentFamily]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Lock sincrono contro il doppio tocco su "Salva piano" (setSaving è asincrono).
  const savingRef = useRef(false);
  const [aiPlans, setAiPlans] = useState<AiMealPlanResponse[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const plansQuery = useQuery<MealPlan[]>({
    queryKey: ["/api/meal-plans", currentFamily?.id, "meal-plans"],
    enabled: !!currentFamily?.id,
  });

  const plans = plansQuery.data || [];

  // Piano scelto per la conversione in lista spesa: apre il modal
  // "settimana intera o un giorno?".
  const [shopChoicePlan, setShopChoicePlan] = useState<MealPlan | null>(null);

  const handleToShoppingList = async (planId: string, date?: string) => {
    if (!currentFamily) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiRequest(
        "POST",
        `/api/meal-plans/${currentFamily.id}/meal-plans/${planId}/to-shopping-list`,
        date ? { date } : {},
      );
      const data = await res.json().catch(() => ({}));
      const skipped: string[] = Array.isArray(data?.skippedFromPantry) ? data.skippedFromPantry : [];
      let msg: string;
      if (!data?.shoppingListId) {
        msg = "Nessuna lista creata: hai già tutti gli ingredienti in dispensa.";
      } else {
        msg = `Lista creata con ${data.ingredientCount} prodotti.`;
      }
      if (skipped.length > 0) {
        msg += `\n\nGià in dispensa (non aggiunti): ${skipped.join(", ")}.`;
      }
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert(data?.shoppingListId ? "Lista creata" : "Tutto in dispensa", msg);
      }
      qc.invalidateQueries({ queryKey: ["/api/shopping", currentFamily.id, "lists"] });
    } catch (e) {
      const limitMsg = freeLimitMessage(e);
      const title = limitMsg ? "Limite raggiunto" : "Errore";
      const body = limitMsg ?? "Impossibile creare la lista della spesa.";
      if (Platform.OS === "web") {
        window.alert(body);
      } else {
        Alert.alert(title, body);
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
              setAiPlans([{
                title: "Piano Settimanale",
                weekStartDate: weekStart,
                items: obj.items,
                preferences,
              }]);
            } else {
              setAiPlans((prev) => {
                if (prev.length === 0) {
                  return [{
                    title: "Piano Settimanale",
                    weekStartDate: weekStart,
                    items: obj.items,
                    preferences,
                  }];
                }
                const first = prev[0]!;
                return [{ ...first, items: [...first.items, ...obj.items] }, ...prev.slice(1)];
              });
            }
          } else if (obj?.type === "done") {
            if (obj.title) doneTitle = obj.title;
            // Il server invia con "done" la lista FINALE (dopo la correzione
            // dei piatti doppi): sostituisce quella accumulata in streaming.
            const finalItems = Array.isArray(obj.items) && obj.items.length > 0 ? (obj.items as MealPlanItem[]) : null;
            if (finalItems) {
              collectedItems.length = 0;
              collectedItems.push(...finalItems);
            }
            setAiPlans((prev) => {
               if (prev.length === 0) {
                 return finalItems
                   ? [{
                       title: obj.title || doneTitle,
                       weekStartDate: obj.weekStartDate || weekStart,
                       items: finalItems,
                       preferences,
                     }]
                   : prev;
               }
              const first = prev[0]!;
              return [
                {
                  ...first,
                  title: obj.title || first.title,
                  weekStartDate: obj.weekStartDate || weekStart,
                  items: finalItems ?? first.items,
                },
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

  const fetchAlternativeStream = async (opts?: { speak?: boolean }) => {
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
    const collectedItems: MealPlanItem[] = [];
    try {
      await apiStream(
        `/api/ai/${currentFamily.id}/weekly-meal-plan/stream`,
        body,
        (obj) => {
          if (obj?.type === "error") {
            streamErr = true;
          } else if (obj?.type === "items" && Array.isArray(obj.items)) {
            collectedItems.push(...(obj.items as MealPlanItem[]));
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
                  preferences,
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
      } else if (opts?.speak && collectedItems.length > 0) {
        speakText(buildPlanSpeech("Piano B - Creativo", collectedItems));
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

  // Il toggle "L'AI legge il piano ad alta voce" vale per QUALSIASI generazione,
  // non solo per quella avviata a voce col microfono.
  const handleGenerate = () => {
    // primeSpeech va chiamato DENTRO il tocco: sblocca la voce del browser
    // (Chrome Android) così la lettura a fine generazione non viene bloccata.
    if (autoSpeak) primeSpeech();
    return fetchMealPlanStream({ speak: autoSpeak });
  };
  const handleGenerateAlternative = () => {
    if (autoSpeak) primeSpeech();
    return fetchAlternativeStream({ speak: autoSpeak });
  };

  // Dettatura completa: l'utente detta dieta, allergie e preferenze in una volta;
  // al rilascio si genera subito il piano e a fine generazione viene letto ad alta voce.
  const handleVoiceGenerate = (text: string) => {
    const spoken = text.trim();
    if (!spoken) return;
    setVoicePrefs(spoken);
    fetchMealPlanStream({ voiceNotes: spoken, speak: autoSpeak });
  };

  const handleSavePlan = async () => {
    const chosenPlan = aiPlans[selectedPlanIndex];
    if (!currentFamily || !chosenPlan) return;
    // Lock sincrono anti doppio tocco: setSaving non è immediato.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const doSave = (replace: boolean) =>
      apiRequest("POST", `/api/meal-plans/${currentFamily.id}/meal-plans`, {
        title: chosenPlan.title,
        weekStartDate: chosenPlan.weekStartDate ?? weekStart,
        replace,
        preferences: chosenPlan.preferences,
        items: chosenPlan.items.map((i) => ({
          date: i.date,
          mealType: i.mealType,
          titleOverride: i.title,
          notes: buildNotes(i.description, i.steps),
          ingredients: i.ingredients || null,
        })),
      });

    const onSaved = () => {
      qc.invalidateQueries({ queryKey: ["/api/meal-plans", currentFamily.id, "meal-plans"] });
      setAiPlans([]);
      setActiveTab("plans");
    };

    const finish = () => {
      savingRef.current = false;
      setSaving(false);
    };

    // Sostituzione atomica sul server (replace=true): il vecchio piano viene
    // rimpiazzato in un'unica transazione, mai perso a metà.
    const replaceExisting = async () => {
      try {
        await doSave(true);
        onSaved();
      } catch (err) {
        const msg = getApiErrorMessage(err, "Impossibile sostituire il piano esistente. Riprova.");
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("Errore", msg);
      } finally {
        finish();
      }
    };

    try {
      await doSave(false);
      onSaved();
      finish();
    } catch (err: any) {
      if (err?.body?.error?.code === "PLAN_EXISTS") {
        const question =
          "Esiste già un piano pasti per questa settimana. Vuoi sostituirlo con quello nuovo?";
        if (Platform.OS === "web") {
          if (window.confirm(question)) {
            await replaceExisting();
          } else {
            finish();
          }
        } else {
          Alert.alert(
            "Piano già presente",
            question,
            [
              { text: "Annulla", style: "cancel", onPress: finish },
              { text: "Sostituisci", style: "destructive", onPress: () => void replaceExisting() },
            ],
            { cancelable: true, onDismiss: finish }
          );
        }
        return;
      }
      const msg = getApiErrorMessage(err, "Impossibile salvare il piano.");
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Errore", msg);
      finish();
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
            <PlanCard
              plan={item}
              onOpen={(id) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/meal-plans/view" as any, params: { planId: id } });
              }}
              onToShoppingList={(id) => {
                const p = plans.find((pl) => pl.id === id);
                if (p) setShopChoicePlan(p);
              }}
              onDelete={handleDeletePlan}
              onEdit={(id) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/meal-plans/edit" as any, params: { planId: id } });
              }}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 20 }]}
          scrollEnabled={true}
          ListHeaderComponent={
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/meal-plans/edit" as any);
              }}
              style={({ pressed }) => [
                styles.manualCreateButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              testID="button-create-manual-plan"
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
              <Text style={[styles.manualCreateText, { color: colors.primary }]}>
                Crea piano manualmente
              </Text>
            </Pressable>
          }
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
                    Tieni premuto il microfono e detta dieta, allergie e preferenze. Al rilascio genero il piano{autoSpeak ? " e te lo leggo" : ""}.
                  </Text>
                </View>
                <VoiceInput
                  familyId={currentFamily.id}
                  size={28}
                  onTranscribed={handleVoiceGenerate}
                  disabled={generating || generatingAlt}
                />
              </View>
              <AiPrivacyNotice />
              <Text style={[styles.aiDisclaimerText, { color: colors.textSecondary }]} testID="mealplan-ai-disclaimer">
                I piani pasti sono generati dall'intelligenza artificiale e non da un nutrizionista: non sostituiscono il parere di un medico o professionista. Per esigenze particolari consulta uno specialista.
              </Text>
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

              <Pressable
                onPress={toggleAutoSpeak}
                style={[styles.autoSpeakRow, { borderTopColor: colors.border }]}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoSpeak }}
                testID="mealplans-autospeak-toggle"
              >
                <Ionicons
                  name={autoSpeak ? "volume-high" : "volume-mute"}
                  size={18}
                  color={autoSpeak ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.autoSpeakLabel, { color: colors.textSecondary }]}>
                  L'AI legge il piano ad alta voce
                </Text>
                <View pointerEvents="none">
                  <Switch
                    value={autoSpeak}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </Pressable>
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
              <Pressable
                onPress={() => router.push("/privacy-center")}
                style={[styles.aiDisabledButton, { backgroundColor: colors.error }]}
                testID="ai-disabled-settings"
              >
                <Text style={styles.aiDisabledButtonText}>Attiva ora</Text>
              </Pressable>
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

      {shopChoicePlan && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShopChoicePlan(null)}>
          <Pressable style={styles.shopChoiceBackdrop} onPress={() => setShopChoicePlan(null)}>
            <Pressable style={[styles.shopChoiceCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
              <Text style={[styles.shopChoiceTitle, { color: colors.text }]}>Lista della spesa</Text>
              <Text style={[styles.shopChoiceSubtitle, { color: colors.textSecondary }]}>
                Per quali giorni vuoi la spesa? Gli ingredienti uguali vengono accorpati e quelli già in dispensa non vengono aggiunti.
              </Text>
              <ScrollView style={styles.shopChoiceList}>
                <Pressable
                  style={[styles.shopChoiceOption, { borderColor: colors.border }]}
                  onPress={() => {
                    const id = shopChoicePlan.id;
                    setShopChoicePlan(null);
                    handleToShoppingList(id);
                  }}
                  testID="button-shop-week"
                >
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                  <Text style={[styles.shopChoiceOptionText, { color: colors.text }]}>Settimana intera</Text>
                </Pressable>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(`${shopChoicePlan.weekStartDate}T00:00:00Z`);
                  d.setUTCDate(d.getUTCDate() + i);
                  const iso = d.toISOString().slice(0, 10);
                  const label = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
                  return (
                    <Pressable
                      key={iso}
                      style={[styles.shopChoiceOption, { borderColor: colors.border }]}
                      onPress={() => {
                        const id = shopChoicePlan.id;
                        setShopChoicePlan(null);
                        handleToShoppingList(id, iso);
                      }}
                      testID={`button-shop-day-${iso}`}
                    >
                      <Ionicons name="cart-outline" size={18} color={colors.secondary} />
                      <Text style={[styles.shopChoiceOptionText, { color: colors.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable style={styles.shopChoiceCancel} onPress={() => setShopChoicePlan(null)}>
                <Text style={[styles.shopChoiceCancelText, { color: colors.textSecondary }]}>Annulla</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
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
  shopChoiceBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  shopChoiceCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    borderRadius: 16,
    padding: 20,
  },
  shopChoiceTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  shopChoiceSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  shopChoiceList: {
    flexGrow: 0,
  },
  shopChoiceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  shopChoiceOptionText: {
    fontSize: 15,
    textTransform: "capitalize",
  },
  shopChoiceCancel: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  shopChoiceCancelText: {
    fontSize: 14,
    fontWeight: "600",
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
  manualCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 14,
  },
  manualCreateText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
  autoSpeakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  autoSpeakLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  aiDisclaimerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 10,
    textAlign: "center",
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
  aiDisabledButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  aiDisabledButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
