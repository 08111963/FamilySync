import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Report {
  id: string;
  familyId: string;
  reporterUserId: string;
  reporterName: string;
  targetType: string;
  targetId: string;
  reasonCategory: string;
  reasonText?: string;
  status: string;
  createdAt: string;
}

const FILTER_TABS = [
  { key: "all", label: "Tutte" },
  { key: "open", label: "Aperte" },
  { key: "actioned", label: "Gestite" },
  { key: "dismissed", label: "Archiviate" },
] as const;

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Molestie",
  hate: "Odio",
  sexual: "Sessuale",
  violence: "Violenza",
  other: "Altro",
};

const TARGET_LABELS: Record<string, string> = {
  user: "Utente",
  calendar_event: "Evento",
  shopping_item: "Acquisto",
  chore: "Faccenda",
};

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const familyId = currentFamily?.id;
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: reports, isLoading } = useQuery<Report[]>({
    queryKey: ["/api/moderation/reports", familyId],
    enabled: !!familyId,
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredReports = (reports || []).filter((r) => {
    if (activeFilter === "all") return true;
    return r.status === activeFilter;
  });

  const handleUpdateStatus = async (reportId: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("PATCH", `/api/moderation/reports/${familyId}/${reportId}`, { status });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/reports", familyId] });
    } catch {}
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return { label: "Aperta", color: colors.warning, bg: colors.warning + "20" };
      case "actioned":
        return { label: "Gestita", color: colors.success, bg: colors.success + "20" };
      case "dismissed":
        return { label: "Archiviata", color: colors.textSecondary, bg: colors.textSecondary + "20" };
      default:
        return { label: status, color: colors.textSecondary, bg: colors.textSecondary + "20" };
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: bottomInset + 24 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Segnalazioni</Text>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveFilter(tab.key);
                }}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Card>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Caricamento...</Text>
          </Card>
        ) : filteredReports.length === 0 ? (
          <Card>
            <EmptyState
              icon="flag-outline"
              title="Nessuna segnalazione"
              subtitle="Non ci sono segnalazioni da visualizzare"
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {filteredReports.map((report) => {
              const statusBadge = getStatusBadge(report.status);
              return (
                <Card key={report.id}>
                  <View style={styles.reportHeader}>
                    <View style={styles.reportMeta}>
                      <Text style={[styles.reporterName, { color: colors.text }]}>
                        {report.reporterName}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                          {statusBadge.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.reportDate, { color: colors.textSecondary }]}>
                      {new Date(report.createdAt).toLocaleDateString("it-IT")}
                    </Text>
                  </View>

                  <View style={styles.reportDetails}>
                    <View style={styles.reportDetailRow}>
                      <Text style={[styles.reportDetailLabel, { color: colors.textSecondary }]}>
                        Tipo:
                      </Text>
                      <Text style={[styles.reportDetailValue, { color: colors.text }]}>
                        {TARGET_LABELS[report.targetType] || report.targetType}
                      </Text>
                    </View>
                    <View style={styles.reportDetailRow}>
                      <Text style={[styles.reportDetailLabel, { color: colors.textSecondary }]}>
                        Motivo:
                      </Text>
                      <Text style={[styles.reportDetailValue, { color: colors.text }]}>
                        {REASON_LABELS[report.reasonCategory] || report.reasonCategory}
                      </Text>
                    </View>
                    {report.reasonText && (
                      <Text style={[styles.reportReasonText, { color: colors.textSecondary }]}>
                        {report.reasonText}
                      </Text>
                    )}
                  </View>

                  {report.status === "open" && (
                    <View style={styles.reportActions}>
                      <Pressable
                        onPress={() => handleUpdateStatus(report.id, "actioned")}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <Text style={styles.actionBtnText}>Gestisci</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleUpdateStatus(report.id, "dismissed")}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          { backgroundColor: colors.textSecondary, opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <Text style={styles.actionBtnText}>Archivia</Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  filterRow: {
    marginBottom: 20,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  content: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 20,
  },
  list: {
    gap: 12,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  reportMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reporterName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  reportDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  reportDetails: {
    gap: 6,
  },
  reportDetailRow: {
    flexDirection: "row",
    gap: 6,
  },
  reportDetailLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  reportDetailValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  reportReasonText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    marginTop: 4,
  },
  reportActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
