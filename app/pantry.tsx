import { useState } from "react";
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

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/Card";

interface PantryItem {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  category: string;
  expiryDate?: string | null;
}

interface PantryData {
  items: PantryItem[];
}

const UNIT_OPTIONS = [
  { value: "", label: "-" },
  { value: "pcs", label: "pz" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "L" },
];

const CATEGORY_LABELS: Record<string, string> = {
  food: "Cibo",
  household_cleaning: "Casa",
  personal_care: "Persona",
};

function formatQuantity(item: PantryItem): string | null {
  if (item.quantity == null) return null;
  const num = Number(item.quantity);
  const qty = Number.isFinite(num) ? String(num % 1 === 0 ? Math.trunc(num) : num) : String(item.quantity);
  const unit = item.unit === "pcs" ? "pz" : item.unit;
  return unit ? `${qty} ${unit}` : qty;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Stato scadenza: expired | soon (entro 3 giorni) | ok */
function expiryStatus(dateStr?: string | null): "expired" | "soon" | "ok" | null {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days < 0) return "expired";
  if (days <= 3) return "soon";
  return "ok";
}

function expiryLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return `Scaduto da ${-days} ${-days === 1 ? "giorno" : "giorni"}`;
  if (days === 0) return "Scade oggi";
  if (days === 1) return "Scade domani";
  if (days <= 7) return `Scade tra ${days} giorni`;
  return `Scade il ${new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
}

/** Converte input utente GG/MM/AAAA (o GG/MM) in YYYY-MM-DD; null se non valido. */
function parseItalianDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(iso + "T00:00:00");
  if (d.getDate() !== day || d.getMonth() + 1 !== month) return null;
  // Se GG/MM senza anno e la data è già passata, assumiamo l'anno prossimo.
  if (!m[3] && daysUntil(iso) < -30) {
    return `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return iso;
}

export default function PantryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const qc = useQueryClient();

  const familyId = currentFamily?.id || "";

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState("");

  const pantryQuery = useQuery<PantryData>({
    queryKey: [`/api/pantry/${familyId}`],
    enabled: !!familyId,
  });

  const items = pantryQuery.data?.items ?? [];
  const expiringCount = items.filter((i) => {
    const s = expiryStatus(i.expiryDate);
    return s === "expired" || s === "soon";
  }).length;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: [`/api/pantry/${familyId}`] });
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
    if (!name.trim()) {
      Alert.alert("Attenzione", "Inserisci il nome del prodotto");
      return;
    }
    let expiryDate: string | null = null;
    if (expiry.trim()) {
      expiryDate = parseItalianDate(expiry);
      if (!expiryDate) {
        Alert.alert("Attenzione", "Data di scadenza non valida. Usa il formato GG/MM/AAAA");
        return;
      }
    }
    const qty = quantity.trim() ? parseFloat(quantity.replace(",", ".")) : null;
    setSaving(true);
    try {
      await apiRequest("POST", `/api/pantry/${familyId}`, {
        name: name.trim(),
        quantity: qty != null && Number.isFinite(qty) ? qty : undefined,
        unit: unit || undefined,
        expiryDate: expiryDate || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName("");
      setQuantity("");
      setUnit("");
      setExpiry("");
      setShowForm(false);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile aggiungere il prodotto");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (item: PantryItem) => {
    try {
      await apiRequest("DELETE", `/api/pantry/${familyId}/${item.id}`);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile rimuovere il prodotto");
    }
  };

  const handleDelete = (item: PantryItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      if (confirm(`Rimuovere "${item.name}" dalla dispensa?`)) doDelete(item);
    } else {
      Alert.alert("Rimuovi dalla dispensa", `Hai finito "${item.name}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Rimuovi", style: "destructive", onPress: () => doDelete(item) },
      ]);
    }
  };

  const saveExpiry = async (item: PantryItem) => {
    let expiryDate: string | null = null;
    if (editingExpiryValue.trim()) {
      expiryDate = parseItalianDate(editingExpiryValue);
      if (!expiryDate) {
        Alert.alert("Attenzione", "Data non valida. Usa il formato GG/MM/AAAA");
        return;
      }
    }
    try {
      await apiRequest("PUT", `/api/pantry/${familyId}/${item.id}`, { expiryDate });
      setEditingExpiryId(null);
      setEditingExpiryValue("");
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile aggiornare la scadenza");
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="pantry-back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Dispensa</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowForm((v) => !v);
          }}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="pantry-add"
        >
          <Ionicons name={showForm ? "close" : "add"} size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {expiringCount > 0 && (
          <Card style={styles.warnCard}>
            <Ionicons name="alert-circle" size={22} color="#FF9800" />
            <Text style={[styles.warnText, { color: colors.text }]}>
              {expiringCount === 1
                ? "1 prodotto è scaduto o in scadenza"
                : `${expiringCount} prodotti sono scaduti o in scadenza`}
            </Text>
          </Card>
        )}

        {showForm && (
          <Card style={styles.formCard}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Aggiungi alla dispensa</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Nome prodotto (es. Passata di pomodoro)"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              maxLength={255}
              testID="pantry-name-input"
            />
            <View style={styles.formRow}>
              <TextInput
                style={[styles.input, styles.qtyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="Quantità"
                placeholderTextColor={colors.textSecondary}
                value={quantity}
                onChangeText={(t) => setQuantity(t.replace(/[^0-9.,]/g, ""))}
                keyboardType="decimal-pad"
                maxLength={8}
              />
              <View style={styles.unitPicker}>
                {UNIT_OPTIONS.map((u) => (
                  <Pressable
                    key={u.value || "none"}
                    onPress={() => setUnit(u.value)}
                    style={[
                      styles.unitOption,
                      {
                        backgroundColor: unit === u.value ? colors.primary : colors.surface,
                        borderColor: unit === u.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.unitText, { color: unit === u.value ? "#FFFFFF" : colors.text }]}>
                      {u.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Scadenza GG/MM/AAAA (facoltativa)"
              placeholderTextColor={colors.textSecondary}
              value={expiry}
              onChangeText={setExpiry}
              maxLength={10}
              testID="pantry-expiry-input"
            />
            <Pressable
              onPress={handleAdd}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.primary, opacity: pressed || saving ? 0.8 : 1 },
              ]}
              testID="pantry-save"
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Aggiungi</Text>}
            </Pressable>
          </Card>
        )}

        {pantryQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="Dispensa vuota"
            subtitle="Aggiungi prodotti con il pulsante + oppure spunta gli acquisti nella lista della spesa: finiranno qui automaticamente."
          />
        ) : (
          <View style={styles.section}>
            {items.map((item) => {
              const status = expiryStatus(item.expiryDate);
              const qtyText = formatQuantity(item);
              const statusColor =
                status === "expired" ? "#F44336" : status === "soon" ? "#FF9800" : colors.textSecondary;
              return (
                <Card key={item.id} style={styles.itemCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                    <View style={styles.itemMetaRow}>
                      {qtyText && (
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{qtyText}</Text>
                      )}
                      {CATEGORY_LABELS[item.category] && item.category !== "food" && (
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                          {CATEGORY_LABELS[item.category]}
                        </Text>
                      )}
                    </View>
                    {editingExpiryId === item.id ? (
                      <View style={styles.expiryEditRow}>
                        <TextInput
                          style={[styles.input, styles.expiryInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                          placeholder="GG/MM/AAAA"
                          placeholderTextColor={colors.textSecondary}
                          value={editingExpiryValue}
                          onChangeText={setEditingExpiryValue}
                          maxLength={10}
                          autoFocus
                        />
                        <Pressable onPress={() => saveExpiry(item)} hitSlop={8}>
                          <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => { setEditingExpiryId(null); setEditingExpiryValue(""); }} hitSlop={8}>
                          <Ionicons name="close-circle-outline" size={26} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setEditingExpiryId(item.id);
                          setEditingExpiryValue(
                            item.expiryDate
                              ? new Date(item.expiryDate + "T00:00:00").toLocaleDateString("it-IT")
                              : ""
                          );
                        }}
                        style={styles.expiryRow}
                        hitSlop={4}
                      >
                        <Ionicons
                          name={status === "expired" || status === "soon" ? "warning" : "calendar-outline"}
                          size={14}
                          color={statusColor}
                        />
                        <Text style={[styles.expiryText, { color: statusColor }]}>
                          {item.expiryDate ? expiryLabel(item.expiryDate) : "Aggiungi scadenza"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={styles.deleteButton} testID={`pantry-delete-${item.id}`}>
                    <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                  </Pressable>
                </Card>
              );
            })}
          </View>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  warnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
  },
  warnText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  formCard: { marginHorizontal: 20, marginBottom: 12, padding: 16, gap: 10 },
  formTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  formRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyInput: { width: 90 },
  unitPicker: { flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" },
  unitOption: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  unitText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  section: { paddingHorizontal: 20 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  itemMetaRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  itemMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  expiryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  expiryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  expiryInput: { flex: 1, paddingVertical: 6 },
  deleteButton: { padding: 4 },
});
