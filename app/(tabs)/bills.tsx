import { useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable, FlatList, Platform, RefreshControl, ActivityIndicator } from "react-native";
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

function BillRow({ bill, onPress }: { bill: Bill; onPress: () => void }) {
  const { colors } = useTheme();
  const cat = CATEGORY_META[bill.category] ?? CATEGORY_META.altro;
  const status = STATUS_META[bill.computedStatus];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.catIcon, { backgroundColor: cat.color + "22" }]}>
        <Ionicons name={cat.icon} size={22} color={cat.color} />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{bill.title}</Text>
        <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
          {bill.provider ? `${bill.provider} · ` : ""}Scad. {formatDueDate(bill.dueDate)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: colors.text }]}>{formatEuro(bill.amount)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.color + "22" }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
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

  const filtered = useMemo(() => {
    if (filter === "all") return bills;
    return bills.filter((b) => b.computedStatus === filter);
  }, [bills, filter]);

  const totalDue = useMemo(
    () => bills.filter((b) => b.status === "da_pagare").reduce((sum, b) => sum + parseFloat(b.amount), 0),
    [bills]
  );

  const { permissionDenied } = useBillNotificationsStatus();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = Platform.OS === "web" ? 84 : 49 + insets.bottom;

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/add-bill");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Bollette</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            {formatEuro(totalDue)} da pagare
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
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => {
              Haptics.selectionAsync();
              setFilter(f.key);
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.key ? colors.primary : colors.surface,
                borderColor: filter === f.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === f.key ? "#fff" : colors.text }]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {billsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24, gap: 12 }}
          scrollEnabled={filtered.length > 0}
          renderItem={({ item }) => (
            <BillRow bill={item} onPress={() => router.push(`/bill/${item.id}`)} />
          )}
          refreshControl={
            <RefreshControl refreshing={billsQuery.isRefetching} onRefresh={() => billsQuery.refetch()} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ marginTop: 60 }}>
              <EmptyState
                icon="receipt-outline"
                title="Nessuna bolletta"
                subtitle="Aggiungi una bolletta per tenere traccia di scadenze e promemoria."
              />
            </View>
          }
        />
      )}
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
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
  rowRight: { alignItems: "flex-end", gap: 6 },
  rowAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
