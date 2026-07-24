import { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import AiPrivacyNotice from "@/components/AiPrivacyNotice";
import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/Card";
import { VoiceInput } from "@/components/VoiceInput";
import { aiErrorMessage } from "@/lib/ai-error-message";
import { AiBadge } from "@/components/AiBadge";

interface Expense {
  id: string;
  memberId?: string | null;
  amount: string;
  category: string;
  description?: string | null;
  date: string;
}

interface Summary {
  month: string;
  total: number;
  categories: Record<string, { total: number; count: number }>;
  budgets: Array<{ category: string; monthlyLimit: number }>;
  trend: Array<{ month: string; total: number }>;
}

interface BudgetInsight {
  title: string;
  description: string;
  type: "warning" | "suggestion" | "achievement";
}

export const EXPENSE_CATEGORY_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  alimentari: { label: "Spesa", icon: "cart", color: "#00B894" },
  trasporti: { label: "Benzina e trasporti", icon: "car", color: "#0984E3" },
  svago: { label: "Svago", icon: "game-controller", color: "#A29BFE" },
  salute: { label: "Salute", icon: "medkit", color: "#FF7675" },
  casa: { label: "Casa", icon: "home", color: "#FDCB6E" },
  abbigliamento: { label: "Abbigliamento", icon: "shirt", color: "#E17055" },
  istruzione: { label: "Istruzione", icon: "school", color: "#55EFC4" },
  bollette: { label: "Bollette", icon: "receipt", color: "#74B9FF" },
  altro: { label: "Altro", icon: "pricetag", color: "#B2BEC3" },
};

const SELECTABLE_CATEGORIES = [
  "alimentari",
  "trasporti",
  "svago",
  "salute",
  "casa",
  "abbigliamento",
  "istruzione",
  "altro",
] as const;

export function formatEuro(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

function monthLabel(month: string): string {
  const d = new Date(month + "-01T00:00:00");
  const label = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatExpenseDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

const INSIGHT_META: Record<BudgetInsight["type"], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  warning: { icon: "alert-circle", color: "#FF7675" },
  suggestion: { icon: "bulb", color: "#FDCB6E" },
  achievement: { icon: "trophy", color: "#00B894" },
};

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily, data } = useFamily();
  const qc = useQueryClient();

  const members = data.members;
  const familyId = currentFamily?.id || "";
  const myRole = currentFamily?.myRole;
  const canSetBudget = myRole === "admin" || myRole === "adult";

  const [month, setMonth] = useState(currentMonth());
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("alimentari");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [insights, setInsights] = useState<BudgetInsight[] | null>(null);
  const [insightsMessage, setInsightsMessage] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [parsingVoice, setParsingVoice] = useState(false);

  // Dettatura spesa: "fatti 50 euro di benzina" → importo + categoria compilati.
  const handleVoiceExpense = async (text: string) => {
    setParsingVoice(true);
    try {
      const res = await apiRequest("POST", `/api/ai/${familyId}/parse-expense`, { text });
      const parsed = await res.json();
      if (parsed.amount != null) setAmount(String(parsed.amount).replace(".", ","));
      if (parsed.category) setCategory(parsed.category);
      if (parsed.description) setDescription(parsed.description);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      // Fallback: metti comunque il testo dettato nella descrizione
      setDescription(text.slice(0, 255));
      Alert.alert(
        "Dettatura",
        aiErrorMessage(error, "Non sono riuscito a capire importo e categoria: ho messo il testo nella descrizione.")
      );
    } finally {
      setParsingVoice(false);
    }
  };

  const summaryKey = [`/api/expenses/${familyId}/summary?month=${month}`];
  const listKey = [`/api/expenses/${familyId}?month=${month}`];

  const summaryQuery = useQuery<Summary>({ queryKey: summaryKey, enabled: !!familyId });
  const listQuery = useQuery<{ items: Expense[] }>({ queryKey: listKey, enabled: !!familyId });

  const summary = summaryQuery.data;
  const expenses = listQuery.data?.items ?? [];

  const totalBudget = summary?.budgets.find((b) => b.category === "total")?.monthlyLimit || 0;
  const spentRatio = totalBudget > 0 && summary ? summary.total / totalBudget : 0;
  const isCurrentMonth = month === currentMonth();

  const sortedCategories = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.categories)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [summary]);

  const maxCategoryTotal = sortedCategories[0]?.total || 1;
  const maxTrend = Math.max(...(summary?.trend.map((t) => t.total) || [1]), 1);

  const memberName = (memberId?: string | null) => {
    if (!memberId) return null;
    const m = members.find((mm) => mm.id === memberId);
    return m?.nickname || m?.name || null;
  };

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: summaryKey }),
      qc.invalidateQueries({ queryKey: listKey }),
    ]);
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdd = async () => {
    const num = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) {
      Alert.alert("Attenzione", "Inserisci un importo valido maggiore di zero");
      return;
    }
    setSaving(true);
    try {
      const today = new Date();
      const date = isCurrentMonth
        ? today.toISOString().slice(0, 10)
        : `${month}-01`;
      await apiRequest("POST", `/api/expenses/${familyId}`, {
        amount: Math.round(num * 100) / 100,
        category,
        description: description.trim() || undefined,
        date,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAmount("");
      setDescription("");
      setShowForm(false);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile aggiungere la spesa");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (item: Expense) => {
    try {
      await apiRequest("DELETE", `/api/expenses/${familyId}/${item.id}`);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile eliminare la spesa");
    }
  };

  const handleDelete = (item: Expense) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const label = item.description || EXPENSE_CATEGORY_META[item.category]?.label || "spesa";
    if (Platform.OS === "web") {
      if (confirm(`Eliminare "${label}" (${formatEuro(item.amount)})?`)) doDelete(item);
    } else {
      Alert.alert("Elimina spesa", `Eliminare "${label}" da ${formatEuro(item.amount)}?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => doDelete(item) },
      ]);
    }
  };

  const saveBudget = async () => {
    const trimmed = budgetInput.trim();
    const num = trimmed ? parseFloat(trimmed.replace(",", ".")) : 0;
    if (trimmed && (!Number.isFinite(num) || num < 0)) {
      Alert.alert("Attenzione", "Inserisci un importo valido");
      return;
    }
    try {
      await apiRequest("PUT", `/api/expenses/${familyId}/budget/limit`, {
        category: "total",
        monthlyLimit: num > 0 ? Math.round(num * 100) / 100 : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingBudget(false);
      setBudgetInput("");
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile salvare il budget");
    }
  };

  const loadInsights = async () => {
    setLoadingInsights(true);
    setInsightsMessage(null);
    try {
      const res = await apiRequest("POST", `/api/ai/${familyId}/budget-insights`, { month });
      const data = await res.json();
      setInsights(Array.isArray(data.insights) ? data.insights : []);
      if (data.message) setInsightsMessage(data.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      setInsights(null);
      Alert.alert("Analisi non disponibile", aiErrorMessage(error, "Impossibile analizzare il budget ora. Riprova più tardi."));
    } finally {
      setLoadingInsights(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="budget-back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Budget familiare</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowForm((v) => !v);
          }}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="budget-add-toggle"
        >
          <Ionicons name={showForm ? "close" : "add"} size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Selettore mese */}
      <View style={styles.monthRow}>
        <Pressable onPress={() => { setInsights(null); setMonth((m) => shiftMonth(m, -1)); }} hitSlop={8} testID="month-prev">
          <Ionicons name="chevron-back-circle" size={28} color={colors.primary} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => { setInsights(null); setMonth((m) => shiftMonth(m, 1)); }}
          hitSlop={8}
          disabled={isCurrentMonth}
          style={{ opacity: isCurrentMonth ? 0.3 : 1 }}
          testID="month-next"
        >
          <Ionicons name="chevron-forward-circle" size={28} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Form aggiunta spesa */}
        {showForm && (
          <Card style={styles.formCard}>
            <View style={styles.formTitleRow}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Nuova spesa</Text>
              {parsingVoice ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <VoiceInput familyId={familyId} onTranscribed={handleVoiceExpense} />
              )}
            </View>
            <Text style={[styles.voiceHint, { color: colors.textSecondary }]}>
              Tieni premuto il microfono e detta la spesa (es. "50 euro di benzina")
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Importo (es. 24,50)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              testID="expense-amount"
            />
            <View style={styles.catGrid}>
              {SELECTABLE_CATEGORIES.map((key) => {
                const meta = EXPENSE_CATEGORY_META[key]!;
                const selected = category === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setCategory(key)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: selected ? meta.color : meta.color + "22",
                        borderColor: meta.color,
                      },
                    ]}
                    testID={`cat-${key}`}
                  >
                    <Ionicons name={meta.icon} size={16} color={selected ? "#fff" : meta.color} />
                    <Text style={[styles.catChipText, { color: selected ? "#fff" : meta.color }]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Descrizione (facoltativa)"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              maxLength={255}
              testID="expense-description"
            />
            <Pressable
              onPress={handleAdd}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 },
              ]}
              testID="expense-save"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Aggiungi spesa</Text>
              )}
            </Pressable>
          </Card>
        )}

        {summaryQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {/* Totale + budget */}
            <Card style={styles.totalCard}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Spese del mese</Text>
              <Text style={[styles.totalValue, { color: colors.text }]} testID="month-total">
                {formatEuro(summary?.total || 0)}
              </Text>

              {totalBudget > 0 ? (
                <>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(spentRatio * 100, 100)}%` as any,
                          backgroundColor: spentRatio >= 1 ? "#FF7675" : spentRatio >= 0.8 ? "#FDCB6E" : "#00B894",
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.budgetLine, { color: colors.textSecondary }]}>
                    Tetto mensile: {formatEuro(totalBudget)} · {Math.round(spentRatio * 100)}% usato
                  </Text>
                  {spentRatio >= 1 ? (
                    <View style={[styles.warnBox, { backgroundColor: "#FF767522" }]} testID="budget-alert">
                      <Ionicons name="alert-circle" size={18} color="#FF7675" />
                      <Text style={[styles.warnText, { color: "#FF7675" }]}>
                        Budget superato di {formatEuro((summary?.total || 0) - totalBudget)}
                      </Text>
                    </View>
                  ) : spentRatio >= 0.8 ? (
                    <View style={[styles.warnBox, { backgroundColor: "#FDCB6E22" }]} testID="budget-alert">
                      <Ionicons name="warning" size={18} color="#E1A500" />
                      <Text style={[styles.warnText, { color: "#E1A500" }]}>
                        Attenzione: ti stai avvicinando al tetto ({formatEuro(totalBudget - (summary?.total || 0))} rimasti)
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.budgetLine, { color: colors.textSecondary }]}>
                  Nessun tetto di budget impostato
                </Text>
              )}

              {canSetBudget && (
                editingBudget ? (
                  <View style={styles.budgetEditRow}>
                    <TextInput
                      style={[styles.input, styles.budgetInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                      placeholder="Tetto mensile € (vuoto = rimuovi)"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      value={budgetInput}
                      onChangeText={setBudgetInput}
                      autoFocus
                      testID="budget-limit-input"
                    />
                    <Pressable onPress={saveBudget} style={[styles.budgetSaveBtn, { backgroundColor: colors.primary }]} testID="budget-limit-save">
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </Pressable>
                    <Pressable onPress={() => setEditingBudget(false)} style={[styles.budgetSaveBtn, { backgroundColor: colors.border }]}>
                      <Ionicons name="close" size={20} color={colors.text} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setBudgetInput(totalBudget > 0 ? String(totalBudget).replace(".", ",") : "");
                      setEditingBudget(true);
                    }}
                    style={styles.budgetEditLink}
                    testID="budget-limit-edit"
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={[styles.budgetEditText, { color: colors.primary }]}>
                      {totalBudget > 0 ? "Modifica tetto" : "Imposta un tetto mensile"}
                    </Text>
                  </Pressable>
                )
              )}
            </Card>

            {/* Grafico per categoria */}
            {sortedCategories.length > 0 && (
              <Card style={styles.sectionCard}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Per categoria</Text>
                {sortedCategories.map((c) => {
                  const meta = EXPENSE_CATEGORY_META[c.key] || EXPENSE_CATEGORY_META.altro!;
                  return (
                    <View key={c.key} style={styles.catRow}>
                      <View style={[styles.catRowIcon, { backgroundColor: meta.color + "22" }]}>
                        <Ionicons name={meta.icon} size={16} color={meta.color} />
                      </View>
                      <View style={styles.catRowMain}>
                        <View style={styles.catRowTop}>
                          <Text style={[styles.catRowLabel, { color: colors.text }]}>{meta.label}</Text>
                          <Text style={[styles.catRowAmount, { color: colors.text }]}>{formatEuro(c.total)}</Text>
                        </View>
                        <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
                          <View
                            style={[
                              styles.catBarFill,
                              { width: `${Math.max((c.total / maxCategoryTotal) * 100, 3)}%` as any, backgroundColor: meta.color },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Trend 6 mesi */}
            {summary && summary.trend.some((t) => t.total > 0) && (
              <Card style={styles.sectionCard}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Ultimi 6 mesi</Text>
                <View style={styles.trendRow}>
                  {summary.trend.map((t) => (
                    <View key={t.month} style={styles.trendCol}>
                      <Text style={[styles.trendValue, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t.total > 0 ? `€${Math.round(t.total)}` : "–"}
                      </Text>
                      <View style={styles.trendBarArea}>
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height: `${Math.max((t.total / maxTrend) * 100, t.total > 0 ? 4 : 2)}%` as any,
                              backgroundColor: t.month === month ? colors.primary : colors.primary + "55",
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>
                        {new Date(t.month + "-01T00:00:00").toLocaleDateString("it-IT", { month: "short" })}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* Analisi AI */}
            <Card style={styles.sectionCard}>
              <View style={styles.aiHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Consigli di risparmio</Text>
                <Pressable
                  onPress={loadInsights}
                  disabled={loadingInsights}
                  style={({ pressed }) => [
                    styles.aiButton,
                    { backgroundColor: colors.primary, opacity: pressed || loadingInsights ? 0.7 : 1 },
                  ]}
                  testID="budget-ai-analyze"
                >
                  {loadingInsights ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={16} color="#fff" />
                      <Text style={styles.aiButtonText}>Analizza</Text>
                    </>
                  )}
                </Pressable>
              </View>
              {insightsMessage ? (
                <Text style={[styles.aiEmptyText, { color: colors.textSecondary }]}>{insightsMessage}</Text>
              ) : insights && insights.length > 0 ? (
                <>
                <AiBadge style={{ marginBottom: 8 }} />
                {insights.map((ins, i) => {
                  const meta = INSIGHT_META[ins.type] || INSIGHT_META.suggestion;
                  return (
                    <View key={i} style={[styles.insightRow, { borderColor: colors.border }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.color} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.insightTitle, { color: colors.text }]}>{ins.title}</Text>
                        <Text style={[styles.insightDesc, { color: colors.textSecondary }]}>{ins.description}</Text>
                      </View>
                    </View>
                  );
                })}
                </>
              ) : (
                <Text style={[styles.aiEmptyText, { color: colors.textSecondary }]}>
                  L'AI analizza le abitudini di spesa del mese e suggerisce dove risparmiare.
                </Text>
              )}
              <AiPrivacyNotice />
            </Card>

            {/* Lista spese */}
            <Text style={[styles.listTitle, { color: colors.text }]}>Spese registrate</Text>
            {listQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : expenses.length === 0 ? (
              <EmptyState
                icon="wallet-outline"
                title="Nessuna spesa questo mese"
                subtitle="Tocca + per registrare la prima spesa: bastano importo e categoria."
              />
            ) : (
              expenses.map((e) => {
                const meta = EXPENSE_CATEGORY_META[e.category] || EXPENSE_CATEGORY_META.altro!;
                const who = memberName(e.memberId);
                return (
                  <View
                    key={e.id}
                    style={[styles.expenseRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    testID={`expense-${e.id}`}
                  >
                    <View style={[styles.catRowIcon, { backgroundColor: meta.color + "22" }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.expenseDesc, { color: colors.text }]} numberOfLines={1}>
                        {e.description || meta.label}
                      </Text>
                      <Text style={[styles.expenseSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {formatExpenseDate(e.date)}
                        {who ? ` · ${who}` : ""}
                      </Text>
                    </View>
                    <Text style={[styles.expenseAmount, { color: colors.text }]}>{formatEuro(e.amount)}</Text>
                    <Pressable onPress={() => handleDelete(e)} hitSlop={8} testID={`expense-delete-${e.id}`}>
                      <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  monthLabel: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: 16, gap: 12 },
  formCard: { padding: 16, gap: 10 },
  formTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  voiceHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  totalCard: { padding: 16, gap: 8 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  totalValue: { fontSize: 34, fontFamily: "Inter_700Bold" },
  progressTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5 },
  budgetLine: { fontSize: 13, fontFamily: "Inter_400Regular" },
  warnBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  warnText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  budgetEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  budgetInput: { flex: 1 },
  budgetSaveBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetEditLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  budgetEditText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  sectionCard: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  catRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowMain: { flex: 1, gap: 4 },
  catRowTop: { flexDirection: "row", justifyContent: "space-between" },
  catRowLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  catRowAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  catBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  catBarFill: { height: "100%", borderRadius: 3 },
  trendRow: { flexDirection: "row", gap: 8, height: 140 },
  trendCol: { flex: 1, alignItems: "center", gap: 4 },
  trendValue: { fontSize: 10, fontFamily: "Inter_500Medium" },
  trendBarArea: { flex: 1, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  trendBar: { width: 18, borderRadius: 4 },
  trendLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  aiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  aiButtonText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  insightRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  insightTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  insightDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  listTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  expenseDesc: { fontSize: 14, fontFamily: "Inter_500Medium" },
  expenseSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  expenseAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
