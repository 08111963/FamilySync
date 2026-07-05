import { useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Switch, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { DateField } from "@/components/DateField";
import { apiRequest, queryClient } from "@/lib/query-client";
import { CATEGORY_META, type Bill } from "@/app/(tabs)/bills";

const CATEGORIES = ["luce", "gas", "acqua", "telefono", "scuola", "assicurazione", "tasse", "altro"] as const;

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime());
}

export default function AddBillScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const params = useLocalSearchParams<{ id?: string; paid?: string; overdue?: string }>();
  const editId = params.id;
  const startPaid = params.paid === "1";
  const startOverdue = params.overdue === "1";
  const familyId = currentFamily?.id;

  const editQuery = useQuery<Bill & any>({
    queryKey: [`/api/bills/${familyId}/${editId}`],
    enabled: !!familyId && !!editId,
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // In modifica, attendi i dati prima di montare il form: lo stato del form è
  // inizializzato dai dati caricati (montaggio singolo via key), evitando campi vuoti.
  if (editId && editQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <BillForm key={editId ?? "new"} editId={editId} existing={editQuery.data} startPaid={startPaid} startOverdue={startOverdue} />
  );
}

function BillForm({
  editId,
  existing,
  startPaid,
  startOverdue,
}: {
  editId?: string;
  existing?: (Bill & any) | undefined;
  startPaid?: boolean;
  startOverdue?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, currentFamily } = useFamily();
  const familyId = currentFamily?.id;

  // Moduli separati:
  // - "/add-bill" → bolletta da pagare, campo "Da pagare entro il"
  // - "/add-bill?overdue=1" → bolletta scaduta, campo "Scaduta il"
  // - "/add-bill?paid=1" → bolletta pagata, campo "Data di pagamento"
  // In modifica lo stato è derivato SOLO dalla bolletta esistente.
  const isPaid = editId ? !!existing && existing.status === "pagata" : !!startPaid;
  const isOverdue = editId ? existing?.computedStatus === "scaduta" : !isPaid && !!startOverdue;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [provider, setProvider] = useState(existing?.provider ?? "");
  const [category, setCategory] = useState<string>(existing?.category ?? "altro");
  const [amount, setAmount] = useState(existing ? String(parseFloat(existing.amount)).replace(".", ",") : "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [paidDate, setPaidDate] = useState(
    existing?.paidAt ? String(existing.paidAt).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [holder, setHolder] = useState(existing?.holder ?? "");
  const [assignedTo, setAssignedTo] = useState<string>(existing?.assignedTo ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(existing?.remindersEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [amountError, setAmountError] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const showError = (msg: string) => {
    if (Platform.OS === "web") alert(msg);
    else Alert.alert("Errore", msg);
  };

  const handleSave = async () => {
    if (!familyId) return;
    if (!title.trim()) {
      setTitleError("Inserisci un titolo, es. \"Bolletta luce giugno\"");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum < 0) {
      setAmountError("Inserisci un importo valido, es. 45,90");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!isPaid && !isValidDate(dueDate)) return showError("Seleziona entro quando va pagata");
    if (isPaid && !isValidDate(paidDate)) return showError("Seleziona la data di pagamento");

    const payload: Record<string, any> = {
      title: title.trim(),
      provider: provider.trim() || undefined,
      category,
      amount: amountNum,
      // Nuova bolletta già pagata: la scadenza coincide con la data di pagamento.
      dueDate: isPaid && !editId ? paidDate : dueDate,
      holder: holder.trim() || undefined,
      assignedTo: assignedTo || null,
      notes: notes.trim() || undefined,
      remindersEnabled,
    };
    if (isPaid && editId) payload.paidAt = paidDate;
    if (isPaid && !editId) {
      payload.paid = true;
      payload.paidAt = paidDate;
    }

    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      if (editId) {
        await apiRequest("PUT", `/api/bills/${familyId}/${editId}`, payload);
        queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}/${editId}`] });
      } else {
        await apiRequest("POST", `/api/bills/${familyId}`, payload);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}`] });
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/bills");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("FREE_LIMIT_REACHED") || msg.includes("403")) {
        showError("Hai raggiunto il limite di 5 bollette attive del piano Free. Passa a Premium per bollette illimitate.");
      } else {
        showError("Impossibile salvare la bolletta");
      }
    } finally {
      setSaving(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/bills"))} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {editId
            ? isPaid
              ? "Modifica Bolletta Pagata"
              : isOverdue
                ? "Modifica Bolletta Scaduta"
                : "Modifica Bolletta"
            : isPaid
              ? "Bolletta Pagata"
              : isOverdue
                ? "Bolletta Scaduta"
                : "Bolletta da Pagare"}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.requiredHint, { color: colors.textSecondary }]}>I campi con * sono obbligatori</Text>

        <View style={styles.field}>
          <Input
            label="Titolo *"
            placeholder="Es. Bolletta luce gennaio"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              if (titleError) setTitleError("");
            }}
            error={titleError || undefined}
            autoFocus={!editId}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Categoria</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const selected = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategory(c);
                  }}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: selected ? meta.color + "22" : colors.surface,
                      borderColor: selected ? meta.color : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={meta.icon} size={16} color={selected ? meta.color : colors.textSecondary} />
                  <Text style={[styles.catChipText, { color: selected ? meta.color : colors.text }]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Input label="Fornitore (opzionale)" placeholder="Es. Enel, A2A..." value={provider} onChangeText={setProvider} />
        </View>

        <View style={styles.field}>
          <Input
            label="Importo (€) *"
            placeholder="0,00"
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              if (amountError) setAmountError("");
            }}
            error={amountError || undefined}
            keyboardType="decimal-pad"
          />
        </View>

        {isPaid ? (
          <>
            <View style={[styles.paidBanner, { backgroundColor: "#00B8941A", borderColor: "#00B894" }]}>
              <Ionicons name="checkmark-circle" size={18} color="#00B894" />
              <Text style={[styles.paidBannerText, { color: "#00B894" }]}>
                {editId
                  ? "Bolletta pagata: qui puoi correggere la data in cui è stata pagata."
                  : "Bolletta già pagata: indica la data in cui è stata pagata."}
              </Text>
            </View>
            <View style={styles.field}>
              <DateField label="Data di pagamento *" placeholder="GG/MM/AAAA" value={paidDate} onChange={setPaidDate} testID="bill-paid-date" />
            </View>
          </>
        ) : (
          <View style={styles.field}>
            <DateField
              label={isOverdue ? "Scaduta il *" : "Da pagare entro il *"}
              placeholder="GG/MM/AAAA"
              value={dueDate}
              onChange={setDueDate}
              testID="bill-due-date"
            />
          </View>
        )}

        <View style={styles.field}>
          <Input label="Intestatario (opzionale)" placeholder="A nome di chi è la bolletta" value={holder} onChangeText={setHolder} />
        </View>

        {data.members.length > 0 && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Responsabile (opzionale)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
              <View style={styles.memberOptions}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAssignedTo("");
                  }}
                  style={[
                    styles.memberOption,
                    {
                      backgroundColor: colors.surface,
                      borderColor: assignedTo === "" ? colors.primary : colors.border,
                      borderWidth: assignedTo === "" ? 2 : 1,
                    },
                  ]}
                >
                  <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.memberName, { color: colors.text }]}>Nessuno</Text>
                </Pressable>
                {data.members.map((member) => (
                  <Pressable
                    key={member.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAssignedTo(member.id);
                    }}
                    style={[
                      styles.memberOption,
                      {
                        backgroundColor: colors.surface,
                        borderColor: assignedTo === member.id ? colors.primary : colors.border,
                        borderWidth: assignedTo === member.id ? 2 : 1,
                      },
                    ]}
                  >
                    <Avatar name={member.name} color={member.color} size={28} />
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.field}>
          <Input
            label="Note (opzionale)"
            placeholder="Aggiungi dettagli..."
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }}
          />
        </View>

        {!isPaid && (
          <View style={[styles.row, { borderColor: colors.border }]}>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Promemoria</Text>
              <Text style={[styles.rowHint, { color: colors.textSecondary }]}>Avvisi prima della scadenza</Text>
            </View>
            <Switch
              value={remindersEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setRemindersEnabled(v);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        )}

        <Button
          title={editId ? "Salva modifiche" : isPaid ? "Registra pagamento" : "Aggiungi Bolletta"}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 40 },
  content: { flex: 1, paddingHorizontal: 20 },
  requiredHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  memberScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  memberOptions: { flexDirection: "row", gap: 12, paddingRight: 20 },
  memberOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
  },
  memberName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  paidBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
