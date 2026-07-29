import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { Card } from "@/components/Card";

/**
 * PANNELLO FEEDBACK TESTER — riservato al proprietario dell'app
 * (allowlist APP_OWNER_EMAILS). Mostra bug, suggerimenti e valutazioni.
 */

interface FeedbackEntry {
  id: string;
  category: "bug" | "suggestion" | "other";
  rating: number | null;
  message: string;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
}

interface FeedbackData {
  entries: FeedbackEntry[];
  summary: { total: number; avgRating: string | null; bugs: number; suggestions: number };
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  bug: { label: "Bug", icon: "bug-outline", color: "#E74C3C" },
  suggestion: { label: "Suggerimento", icon: "bulb-outline", color: "#F39C12" },
  other: { label: "Altro", icon: "chatbubble-ellipses-outline", color: "#5856D6" },
};

export default function FeedbackAdminScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<FeedbackData>({
    queryKey: ["/api/admin/feedback"],
    retry: false,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const entries = data?.entries ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Feedback tester</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : isError ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Accesso non consentito o errore di caricamento.
          </Text>
        ) : (
          <>
            {data?.summary && (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{data.summary.total}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Totale</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: "#E74C3C" }]}>{data.summary.bugs}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Bug</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: "#F39C12" }]}>{data.summary.suggestions}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Idee</Text>
                </View>
                <View style={styles.summaryItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="star" size={16} color="#FFB300" />
                    <Text style={[styles.summaryValue, { color: colors.text }]}>
                      {data.summary.avgRating ?? "-"}
                    </Text>
                  </View>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Media</Text>
                </View>
              </Card>
            )}

            {entries.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Nessun feedback ricevuto finora.
              </Text>
            ) : (
              entries.map((e) => {
                const meta = CATEGORY_META[e.category] ?? CATEGORY_META.other!;
                return (
                  <Card key={e.id} style={styles.entryCard}>
                    <View style={styles.entryHeader}>
                      <View style={[styles.badge, { backgroundColor: meta.color + "20" }]}>
                        <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      {e.rating ? (
                        <View style={{ flexDirection: "row", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Ionicons
                              key={s}
                              name={s <= e.rating! ? "star" : "star-outline"}
                              size={14}
                              color="#FFB300"
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.entryMessage, { color: colors.text }]}>{e.message}</Text>
                    <Text style={[styles.entryMeta, { color: colors.textSecondary }]}>
                      {e.userName} ({e.userEmail}) · {e.platform || "?"}
                      {e.appVersion ? ` · v${e.appVersion}` : ""} ·{" "}
                      {new Date(e.createdAt).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Card>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryCard: { flexDirection: "row", justifyContent: "space-around", padding: 16, marginBottom: 14 },
  summaryItem: { alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  entryCard: { padding: 14, marginBottom: 10, gap: 8 },
  entryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  entryMessage: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  entryMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyText: { textAlign: "center", marginTop: 32, fontSize: 14, fontFamily: "Inter_400Regular" },
});
