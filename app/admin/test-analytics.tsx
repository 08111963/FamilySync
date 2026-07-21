import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { Card } from "@/components/Card";
import { apiRequest, queryClient } from "@/lib/query-client";

/**
 * PANNELLO TEST ANALYTICS — riservato al proprietario dell'app
 * (allowlist APP_OWNER_EMAILS). Funzione TEMPORANEA per il periodo di test.
 */

type Period = "today" | "7d" | "30d";

interface UserUsage {
  userId: string | null;
  email: string;
  isDemoAccount: boolean;
  totalEvents: number;
  lastSeen: string;
  screens: { screen: string | null; n: number }[];
}

interface Summary {
  period: string;
  totalEvents: number;
  activeUsersToday: number;
  appOpens: number;
  topScreens: { screen: string | null; n: number }[];
  topFeatures: { feature: string | null; n: number }[];
  byPlatform: { platform: string | null; n: number }[];
  byEvent: { eventName: string; n: number }[];
  recentErrors: { id: string; screen: string | null; metadata: Record<string, unknown>; platform: string | null; createdAt: string }[];
  lastEvent: { eventName: string; createdAt: string; platform: string | null } | null;
  demoAccountEvents: number;
  appVersions: { appVersion: string | null; n: number }[];
}

const PERIOD_LABELS: Record<Period, string> = { today: "Oggi", "7d": "7 giorni", "30d": "30 giorni" };

export default function TestAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>("7d");

  const { data, isLoading, isError, refetch } = useQuery<Summary>({
    queryKey: ["/api/admin/test-analytics/summary?period=" + period],
    retry: false,
  });

  const usersQuery = useQuery<{ users: UserUsage[] }>({
    queryKey: ["/api/admin/test-analytics/users?period=" + period],
    retry: false,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/admin/test-analytics");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/test-analytics") });
      Alert.alert("Fatto", "Tutti i dati analytics di test sono stati eliminati.");
    },
    onError: () => Alert.alert("Errore", "Impossibile svuotare le analytics."),
  });

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Svuota analytics test",
      "Eliminare TUTTI gli eventi raccolti? L'operazione non è reversibile.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina tutto", style: "destructive", onPress: () => clearMutation.mutate() },
      ],
    );
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="back-button">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Test Analytics</Text>
        <Pressable onPress={() => refetch()} hitSlop={12} testID="refresh-button">
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 32, gap: 12 }}>
        <View style={styles.periodRow}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => { Haptics.selectionAsync(); setPeriod(p); }}
              style={[
                styles.periodChip,
                { backgroundColor: period === p ? colors.primary : colors.surface, borderColor: colors.border },
              ]}
              testID={`period-${p}`}
            >
              <Text style={{ color: period === p ? "#FFF" : colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />}
        {isError && (
          <Card>
            <Text style={{ color: colors.error, fontFamily: "Inter_500Medium" }}>
              Accesso negato o funzione disattivata (ENABLE_TEST_ANALYTICS).
            </Text>
          </Card>
        )}

        {data && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{data.activeUsersToday}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Utenti attivi oggi</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{data.appOpens}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Aperture app</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{data.totalEvents}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Eventi totali</Text>
              </Card>
            </View>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Piattaforme</Text>
              {data.byPlatform.length === 0 && <Text style={{ color: colors.textSecondary }}>Nessun dato</Text>}
              {data.byPlatform.map((p, i) => (
                <Row key={i} colors={colors} label={p.platform ?? "sconosciuta"} value={p.n} />
              ))}
              <Text style={[styles.cardTitle, { color: colors.text, marginTop: 12 }]}>Versioni app</Text>
              {data.appVersions.map((v, i) => (
                <Row key={i} colors={colors} label={v.appVersion ?? "sconosciuta"} value={v.n} />
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Schermate più visitate</Text>
              {data.topScreens.length === 0 && <Text style={{ color: colors.textSecondary }}>Nessun dato</Text>}
              {data.topScreens.map((s, i) => (
                <Row key={i} colors={colors} label={s.screen ?? "?"} value={s.n} />
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Funzioni più usate</Text>
              {data.topFeatures.length === 0 && <Text style={{ color: colors.textSecondary }}>Nessun dato</Text>}
              {data.topFeatures.map((f, i) => (
                <Row key={i} colors={colors} label={f.feature ?? "?"} value={f.n} />
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Eventi per tipo</Text>
              {data.byEvent.map((e, i) => (
                <Row key={i} colors={colors} label={e.eventName} value={e.n} />
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Per utente</Text>
              {(usersQuery.data?.users ?? []).length === 0 && (
                <Text style={{ color: colors.textSecondary }}>Nessun utente nel periodo</Text>
              )}
              {(usersQuery.data?.users ?? []).map((u) => (
                <View
                  key={u.userId ?? u.email}
                  style={{ paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 }} numberOfLines={1}>
                      {u.email}
                    </Text>
                    {u.isDemoAccount && (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>DEMO</Text>
                    )}
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{u.totalEvents} eventi</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Ultimo accesso: {new Date(u.lastSeen).toLocaleString("it-IT")}
                  </Text>
                  {u.screens.length > 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      Schermate: {u.screens.map((s) => `${s.screen ?? "?"} (${s.n})`).join(" · ")}
                    </Text>
                  )}
                </View>
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Errori recenti (api_error)</Text>
              {data.recentErrors.length === 0 && <Text style={{ color: colors.textSecondary }}>Nessun errore, ottimo!</Text>}
              {data.recentErrors.map((e) => (
                <View key={e.id} style={{ paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.error, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                    {String(e.metadata?.route ?? e.screen ?? "?")} — {String(e.metadata?.status ?? "")}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {e.platform ?? "?"} · {new Date(e.createdAt).toLocaleString("it-IT")}
                  </Text>
                </View>
              ))}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Stato</Text>
              <Row colors={colors} label="Eventi account demo" value={data.demoAccountEvents} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }}>
                Ultimo evento: {data.lastEvent
                  ? `${data.lastEvent.eventName} (${data.lastEvent.platform ?? "?"}) — ${new Date(data.lastEvent.createdAt).toLocaleString("it-IT")}`
                  : "nessuno"}
              </Text>
            </Card>

            <Pressable
              onPress={handleClear}
              disabled={clearMutation.isPending}
              style={({ pressed }) => [styles.clearButton, { borderColor: colors.error, opacity: pressed || clearMutation.isPending ? 0.6 : 1 }]}
              testID="clear-analytics-button"
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={{ color: colors.error, fontFamily: "Inter_600SemiBold" }}>Svuota analytics test</Text>
            </Pressable>

            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "center" }}>
              Funzione temporanea di test · retention 30 giorni · nessun contenuto personale raccolto
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ colors, label, value }: { colors: any; label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: colors.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{value}</Text>
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  periodRow: { flexDirection: "row", gap: 8 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statNumber: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, textAlign: "center", marginTop: 2 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 8 },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
});
