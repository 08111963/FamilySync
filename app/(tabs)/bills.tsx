import { useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable, SectionList, Platform, RefreshControl, ActivityIndicator, Alert, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useSubscription } from "@/lib/revenuecat";
import { useBillNotificationsStatus } from "@/context/BillNotificationsProvider";
import { EmptyState } from "@/components/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

export type BillComputedStatus = "da_pagare" | "pagata" | "scaduta";

export interface Bill {
  id: string;
  familyId: string;
  title: string;
  provider?: string | null;
  category: string;
  amount: string;
  dueDate: string;
  holder?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  remindersEnabled: boolean;
  status: "da_pagare" | "pagata";
  computedStatus: BillComputedStatus;
  paidAt?: string | null;
}

export const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  luce: { label: "Luce", icon: "bulb", color: "#FDCB6E" },
  gas: { label: "Gas", icon: "flame", color: "#FF7675" },
  acqua: { label: "Acqua", icon: "water", color: "#74B9FF" },
  telefono: { label: "Telefono", icon: "call", color: "#A29BFE" },
  scuola: { label: "Scuola", icon: "school", color: "#55EFC4" },
  assicurazione: { label: "Assicurazione", icon: "shield-checkmark", color: "#00B894" },
  tasse: { label: "Tasse", icon: "document-text", color: "#E17055" },
  altro: { label: "Altro", icon: "pricetag", color: "#B2BEC3" },
};

const FILTERS = [
  { key: "all", label: "Tutte" },
  { key: "da_pagare", label: "Da pagare" },
  { key: "scaduta", label: "Scadute" },
  { key: "pagata", label: "Pagate" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function formatEuro(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export function formatDueDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const STATUS_META: Record<BillComputedStatus, { label: string; color: string }> = {
  da_pagare: { label: "Da pagare", color: "#74B9FF" },
  scaduta: { label: "Scaduta", color: "#E74C3C" },
  pagata: { label: "Pagata", color: "#00B894" },
};

/**
 * Dicitura contestuale sulla scadenza: "Scade oggi", "Scaduta da 3 giorni",
 * "Pagata il ...". Usa il giorno UTC come il backend (computeBillStatus in
 * server/lib/bills.ts) così testo e badge di stato non divergono mai; lo stato
 * (urgente o no) deriva SEMPRE da computedStatus, mai dal calcolo locale.
 */
export function billDueLabel(bill: Bill, now: Date = new Date()): { text: string; urgent: boolean } {
  if (bill.computedStatus === "pagata") {
    const paidDate = bill.paidAt ? formatDueDate(bill.paidAt.slice(0, 10)) : null;
    return { text: paidDate ? `Pagata il ${paidDate}` : "Pagata", urgent: false };
  }
  const today = now.toISOString().slice(0, 10);
  const diff = Math.round(
    (new Date(`${bill.dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000
  );
  if (bill.computedStatus === "scaduta") {
    const days = Math.max(1, -diff);
    return { text: `Scaduta da ${days} ${days === 1 ? "giorno" : "giorni"}`, urgent: true };
  }
  if (diff <= 0) return { text: "Scade oggi", urgent: true };
  if (diff === 1) return { text: "Scade domani", urgent: false };
  if (diff <= 7) return { text: `Scade tra ${diff} giorni`, urgent: false };
  return { text: `Scade il ${formatDueDate(bill.dueDate)}`, urgent: false };
}

function BillRow({ bill, onPress, onDelete }: { bill: Bill; onPress: () => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  const cat = CATEGORY_META[bill.category] ?? CATEGORY_META.altro;
  const status = STATUS_META[bill.computedStatus];
  const due = billDueLabel(bill);
  const isOverdue = bill.computedStatus === "scaduta";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          // Le scadute hanno sfondo rosato e bordo rosso: devono saltare all'occhio.
          backgroundColor: isOverdue ? STATUS_META.scaduta.color + "14" : colors.surface,
          borderColor: isOverdue ? STATUS_META.scaduta.color : colors.border,
          borderWidth: isOverdue ? 1.5 : 1,
          borderLeftColor: status.color,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.catIcon, { backgroundColor: cat.color + "22" }]}>
        <Ionicons name={cat.icon} size={22} color={cat.color} />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{bill.title}</Text>
        <Text
          style={[
            styles.rowSub,
            { color: due.urgent ? STATUS_META.scaduta.color : colors.textSecondary },
            due.urgent && styles.rowSubUrgent,
          ]}
          numberOfLines={1}
        >
          {bill.provider ? `${bill.provider} · ` : ""}{due.text}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: isOverdue ? STATUS_META.scaduta.color : colors.text }]}>
          {formatEuro(bill.amount)}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: isOverdue ? status.color : status.color + "22" }]}>
          {isOverdue && <Ionicons name="alert-circle" size={12} color="#fff" />}
          <Text style={[styles.statusText, { color: isOverdue ? "#fff" : status.color }]}>{status.label}</Text>
        </View>
      </View>
      {onDelete && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
          testID={`delete-bill-${bill.id}`}
        >
          <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      )}
    </Pressable>
  );
}

export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const { isSubscribed } = useSubscription();
  const familyId = currentFamily?.id;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [addChooserVisible, setAddChooserVisible] = useState(false);

  const billsQuery = useQuery<Bill[]>({
    queryKey: [`/api/bills/${familyId}`],
    enabled: !!familyId,
    staleTime: 15000,
  });

  const bills = billsQuery.data ?? [];

  const activeCount = useMemo(
    () => bills.filter((b) => b.status === "da_pagare").length,
    [bills]
  );

  // Raggruppa per stato: scadute (più urgenti prima), da pagare (scadenza più
  // vicina prima), pagate (pagamento più recente prima).
  const groups = useMemo(() => {
    const byDueAsc = (a: Bill, b: Bill) => a.dueDate.localeCompare(b.dueDate);
    const byPaidDesc = (a: Bill, b: Bill) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "");
    const sum = (list: Bill[]) => list.reduce((s, b) => s + parseFloat(b.amount), 0);
    const scadute = bills.filter((b) => b.computedStatus === "scaduta").sort(byDueAsc);
    const daPagare = bills.filter((b) => b.computedStatus === "da_pagare").sort(byDueAsc);
    const pagate = bills.filter((b) => b.computedStatus === "pagata").sort(byPaidDesc);
    return {
      scaduta: { data: scadute, total: sum(scadute) },
      da_pagare: { data: daPagare, total: sum(daPagare) },
      pagata: { data: pagate, total: sum(pagate) },
    };
  }, [bills]);

  const sections = useMemo(() => {
    const make = (key: BillComputedStatus) => ({
      key,
      title: key === "scaduta" ? "Scadute" : key === "da_pagare" ? "Da pagare" : "Pagate",
      color: STATUS_META[key].color,
      count: groups[key].data.length,
      total: groups[key].total,
      data: groups[key].data,
    });
    if (filter === "all") {
      return (["scaduta", "da_pagare", "pagata"] as const).map(make).filter((s) => s.count > 0);
    }
    const s = make(filter);
    return s.count > 0 ? [s] : [];
  }, [groups, filter]);

  const totalDue = groups.da_pagare.total + groups.scaduta.total;

  // Sottotitolo header contestuale al filtro selezionato.
  const headerSub = useMemo(() => {
    switch (filter) {
      case "scaduta":
        return groups.scaduta.data.length > 0
          ? `${groups.scaduta.data.length} scadute · ${formatEuro(groups.scaduta.total)} da saldare subito`
          : "Nessuna bolletta scaduta";
      case "da_pagare":
        return groups.da_pagare.data.length > 0
          ? `${groups.da_pagare.data.length} in scadenza · ${formatEuro(groups.da_pagare.total)}`
          : "Nessuna bolletta in scadenza";
      case "pagata":
        return groups.pagata.data.length > 0
          ? `${groups.pagata.data.length} pagate · ${formatEuro(groups.pagata.total)}`
          : "Nessuna bolletta pagata";
      default:
        return `${formatEuro(totalDue)} da pagare`;
    }
  }, [filter, groups, totalDue]);

  const EMPTY_STATES: Record<FilterKey, { title: string; subtitle: string }> = {
    all: {
      title: "Nessuna bolletta",
      subtitle: "Aggiungi una bolletta per tenere traccia di scadenze e promemoria.",
    },
    da_pagare: {
      title: "Nessuna bolletta in scadenza",
      subtitle: "Tutto in regola: non ci sono bollette da pagare al momento.",
    },
    scaduta: {
      title: "Nessuna bolletta scaduta",
      subtitle: "Ottimo! Nessuna scadenza è stata superata.",
    },
    pagata: {
      title: "Nessuna bolletta pagata",
      subtitle: "Le bollette che segni come pagate compariranno qui.",
    },
  };

  const { permissionDenied } = useBillNotificationsStatus();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = Platform.OS === "web" ? 84 : 49 + insets.bottom;

  const doDeleteBill = async (bill: Bill) => {
    try {
      await apiRequest("DELETE", `/api/bills/${familyId}/${bill.id}`);
      queryClient.invalidateQueries({ queryKey: [`/api/bills/${familyId}`] });
    } catch {
      if (Platform.OS === "web") window.alert("Impossibile eliminare la bolletta");
      else Alert.alert("Errore", "Impossibile eliminare la bolletta");
    }
  };

  const handleDeleteBill = (bill: Bill) => {
    if (!familyId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Su web Alert.alert non mostra nulla: usiamo window.confirm.
    if (Platform.OS === "web") {
      if (window.confirm(`Vuoi eliminare definitivamente "${bill.title}"?`)) {
        doDeleteBill(bill);
      }
      return;
    }
    Alert.alert("Elimina bolletta", `Vuoi eliminare definitivamente "${bill.title}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => doDeleteBill(bill) },
    ]);
  };

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Moduli separati per stato: il "+" apre il form del filtro attivo;
    // su "Tutte" si sceglie quale tipo aggiungere.
    if (filter === "pagata") {
      router.push("/add-bill?paid=1");
      return;
    }
    if (filter === "scaduta") {
      router.push("/add-bill?overdue=1");
      return;
    }
    if (filter !== "all") {
      router.push("/add-bill");
      return;
    }
    // Modal cross-platform: su web Alert.alert con più bottoni non funziona.
    setAddChooserVisible(true);
  };

  const chooseAdd = (path: string) => {
    setAddChooserVisible(false);
    router.push(path as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Bollette</Text>
          <Text style={[styles.headerSub, { color: filter === "scaduta" && groups.scaduta.data.length > 0 ? STATUS_META.scaduta.color : colors.textSecondary }]}>
            {headerSub}
          </Text>
        </View>
        <Pressable onPress={handleAdd} style={[styles.addButton, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {!isSubscribed && (
        <Pressable
          onPress={() => router.push("/premium")}
          style={[styles.freeBanner, { backgroundColor: colors.accent + "33", borderColor: colors.accent }]}
        >
          <Ionicons name="star" size={16} color={colors.text} />
          <Text style={[styles.freeBannerText, { color: colors.text }]}>
            Piano Free: {activeCount}/5 bollette attive. Passa a Premium per illimitate, allegati e ripartizioni.
          </Text>
        </Pressable>
      )}

      {permissionDenied && (
        <View style={[styles.freeBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="notifications-off" size={16} color={colors.textSecondary} />
          <Text style={[styles.freeBannerText, { color: colors.textSecondary }]}>
            Notifiche disattivate: attivale dalle impostazioni del telefono per ricevere i promemoria delle scadenze.
          </Text>
        </View>
      )}

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const count = f.key === "all" ? bills.length : groups[f.key].data.length;
          const active = filter === f.key;
          const dotColor = f.key === "all" ? null : STATUS_META[f.key].color;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter(f.key);
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              {dotColor && <View style={[styles.filterDot, { backgroundColor: dotColor }]} />}
              <Text style={[styles.filterText, { color: active ? "#fff" : colors.text }]}>
                {f.label}{count > 0 ? ` (${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {billsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24 }}
          scrollEnabled={sections.length > 0}
          stickySectionHeadersEnabled={false}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <BillRow
                bill={item}
                onPress={() => router.push(`/bill/${item.id}`)}
                onDelete={item.computedStatus === "pagata" ? () => handleDeleteBill(item) : undefined}
              />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {section.title} ({section.count})
              </Text>
              <Text style={[styles.sectionTotal, { color: colors.textSecondary }]}>
                {formatEuro(section.total)}
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={billsQuery.isRefetching} onRefresh={() => billsQuery.refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ marginTop: 60 }}>
              <EmptyState
                icon="receipt-outline"
                title={EMPTY_STATES[filter].title}
                subtitle={EMPTY_STATES[filter].subtitle}
              />
            </View>
          }
        />
      )}

      <Modal visible={addChooserVisible} transparent animationType="fade" onRequestClose={() => setAddChooserVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddChooserVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Aggiungi bolletta</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>Quale tipo di bolletta vuoi aggiungere?</Text>
            <Pressable
              onPress={() => chooseAdd("/add-bill")}
              style={[styles.modalOption, { borderColor: colors.border }]}
              testID="add-choice-da-pagare"
            >
              <View style={[styles.sectionDot, { backgroundColor: STATUS_META.da_pagare.color }]} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>Da pagare</Text>
            </Pressable>
            <Pressable
              onPress={() => chooseAdd("/add-bill?overdue=1")}
              style={[styles.modalOption, { borderColor: colors.border }]}
              testID="add-choice-scaduta"
            >
              <View style={[styles.sectionDot, { backgroundColor: STATUS_META.scaduta.color }]} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>Scaduta</Text>
            </Pressable>
            <Pressable
              onPress={() => chooseAdd("/add-bill?paid=1")}
              style={[styles.modalOption, { borderColor: colors.border }]}
              testID="add-choice-pagata"
            >
              <View style={[styles.sectionDot, { backgroundColor: STATUS_META.pagata.color }]} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>Già pagata</Text>
            </Pressable>
            <Pressable onPress={() => setAddChooserVisible(false)} style={styles.modalCancel} testID="add-choice-annulla">
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Annulla</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  freeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  freeBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexWrap: "wrap",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  sectionTotal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowSubUrgent: { fontFamily: "Inter_600SemiBold" },
  rowRight: { alignItems: "flex-end", gap: 6 },
  rowAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deleteBtn: { marginLeft: 10, padding: 6, alignSelf: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 380, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, marginBottom: 16 },
  modalOption: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  modalOptionText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalCancel: { alignItems: "center", paddingVertical: 12, marginTop: 2 },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
