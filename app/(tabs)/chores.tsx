import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { recurrenceLabel } from "@/shared/chore-recurrence";

type FilterType = "all" | "pending" | "completed";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Tutte",
  pending: "Da fare",
  completed: "Fatte",
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "#4CAF50",
  2: "#8BC34A",
  3: "#FF9800",
  4: "#FF5722",
  5: "#F44336",
};

export default function ChoresScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, currentFamily, completeChore, deleteChore } = useFamily();
  const [filter, setFilter] = useState<FilterType>("pending");

  const familyId = currentFamily?.id || "";

  const filteredChores = data.chores.filter((chore) => {
    if (filter === "pending") return !chore.isCompleted;
    if (filter === "completed") return chore.isCompleted;
    return true;
  });

  // Suddivisione per giornate: In ritardo / Oggi / Domani / date future /
  // Senza scadenza. Così la pagina non diventa un'unica lunga lista.
  // Le date sono confrontate in ORARIO LOCALE del dispositivo (mai UTC:
  // dopo mezzanotte "oggi" sbaglierebbe giorno).
  const toLocalIso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const localDateFromIso = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayIso = toLocalIso(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toLocalIso(tomorrow);

  const sectionLabelFor = (chore: (typeof filteredChores)[number]): { key: string; label: string; order: number } => {
    const d = chore.dueDate;
    if (!d) return { key: "none", label: "Senza scadenza", order: 4 };
    if (d < todayIso && !chore.isCompleted) return { key: "overdue", label: "In ritardo", order: 0 };
    if (d === todayIso) return { key: d, label: "Oggi", order: 1 };
    if (d === tomorrowIso) return { key: d, label: "Domani", order: 2 };
    const label = localDateFromIso(d).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    return { key: d, label: label.charAt(0).toUpperCase() + label.slice(1), order: 3 };
  };

  const sections: { key: string; label: string; order: number; chores: typeof filteredChores }[] = [];
  for (const chore of filteredChores) {
    const s = sectionLabelFor(chore);
    const existing = sections.find((x) => x.key === s.key && x.label === s.label);
    if (existing) existing.chores.push(chore);
    else sections.push({ ...s, chores: [chore] });
  }
  sections.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.key.localeCompare(b.key)));

  const getMember = (memberId: string | null | undefined) => {
    return data.members.find((m) => m.id === memberId);
  };

  const handleCompleteChore = (choreId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeChore(choreId);
  };

  const handleDeleteChore = (choreId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteChore(choreId);
  };

  const handleReportChore = (choreId: string) => {
    router.push({
      pathname: "/report-content",
      params: { targetType: "chore", targetId: choreId, familyId },
    });
  };

  const handleChoreActions = (choreId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      if (confirm("Vuoi segnalare questa faccenda?")) {
        handleReportChore(choreId);
      }
    } else {
      Alert.alert("Azioni", "", [
        { text: "Segnala", onPress: () => handleReportChore(choreId) },
        { text: "Annulla", style: "cancel" },
      ]);
    }
  };

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return null;
    if (dateStr === todayIso) return "Oggi";
    if (dateStr === tomorrowIso) return "Domani";
    return localDateFromIso(dateStr).toLocaleDateString("it-IT", { month: "short", day: "numeric" });
  };

  const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    return dateStr < todayIso;
  };

  const getFrequencyLabel = (frequency?: string) => recurrenceLabel(frequency);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Faccende</Text>
        <View style={styles.headerActions}>
        <Pressable
          onPress={() => router.push("/rewards")}
          style={({ pressed }) => [
            styles.rewardsButton,
            { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="rewards-link-chores"
        >
          <Ionicons name="gift-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionLabel, { color: colors.primary }]}>Premi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/add-chore")}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(["pending", "completed", "all"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilter(f);
            }}
            style={[
              styles.filterButton,
              {
                backgroundColor: filter === f ? colors.primary : colors.surface,
                borderColor: filter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? "#FFFFFF" : colors.text },
              ]}
            >
              {FILTER_LABELS[f]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.choresList}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredChores.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={filter === "completed" ? "Nessuna faccenda completata" : "Nessuna faccenda da fare"}
            subtitle={filter === "pending" ? "Aggiungi una faccenda per iniziare" : "Completa alcune faccende per vederle qui"}
          />
        ) : (
          <View style={styles.chores}>
            {sections.map((section) => (
              <View key={`${section.key}-${section.label}`}>
                <View style={styles.sectionHeader}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: section.key === "overdue" ? colors.error : colors.textSecondary },
                    ]}
                  >
                    {section.label}
                  </Text>
                  <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
                    {section.chores.length}
                  </Text>
                </View>
                {section.chores.map((chore) => {
              const member = getMember(chore.assignedTo);
              const dueDate = formatDueDate(chore.dueDate);
              const overdue = isOverdue(chore.dueDate) && !chore.isCompleted;
              const diffLevel = chore.difficulty ?? null;
              const diffColor = diffLevel ? (DIFFICULTY_COLORS[diffLevel] || "#FF9800") : null;

              return (
                <Card key={chore.id}>
                  <View style={styles.choreRow}>
                    <Pressable
                      onPress={() => !chore.isCompleted && handleCompleteChore(chore.id)}
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: chore.isCompleted ? colors.success : "transparent",
                          borderColor: chore.isCompleted ? colors.success : colors.border,
                        },
                      ]}
                    >
                      {chore.isCompleted && (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </Pressable>
                    <View style={styles.choreInfo}>
                      <Text
                        style={[
                          styles.choreTitle,
                          {
                            color: chore.isCompleted ? colors.textSecondary : colors.text,
                            textDecorationLine: chore.isCompleted ? "line-through" : "none",
                          },
                        ]}
                      >
                        {chore.title}
                      </Text>
                      <View style={styles.choreMeta}>
                        {diffLevel && diffColor && (
                          <View style={[styles.difficultyBadge, { backgroundColor: diffColor + "20" }]}>
                            <Text style={[styles.difficultyBadgeText, { color: diffColor }]}>
                              {diffLevel}/5
                            </Text>
                          </View>
                        )}
                        {chore.estimatedMinutes ? (
                          <View style={styles.timeBadge}>
                            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                              {chore.estimatedMinutes} min
                            </Text>
                          </View>
                        ) : null}
                        {member && (
                          <View style={styles.choreAssignee}>
                            <Avatar name={member.name} color={member.color} size={20} />
                            <Text style={[styles.choreAssigneeName, { color: colors.textSecondary }]}>
                              {member.name}
                            </Text>
                          </View>
                        )}
                        {dueDate && (
                          <View style={styles.choreDue}>
                            <Ionicons
                              name="calendar-outline"
                              size={14}
                              color={overdue ? colors.error : colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.choreDueText,
                                { color: overdue ? colors.error : colors.textSecondary },
                              ]}
                            >
                              {dueDate}
                              {chore.dueTime ? ` · ${chore.dueTime}` : ""}
                            </Text>
                          </View>
                        )}
                        {chore.recurrenceRule && (
                          <View style={styles.choreRecurring}>
                            <Ionicons name="repeat" size={14} color={colors.secondary} />
                            <Text style={[styles.choreRecurringText, { color: colors.secondary }]}>
                              {getFrequencyLabel(chore.recurrenceRule)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.choreRight}>
                      <View style={[styles.chorePoints, { backgroundColor: colors.accent }]}>
                        <Text style={styles.chorePointsText}>{chore.points}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push({ pathname: "/add-chore", params: { choreId: chore.id } });
                        }}
                        style={styles.moreButton}
                        testID={`edit-chore-${chore.id}`}
                      >
                        <Ionicons name="pencil-outline" size={17} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => handleChoreActions(chore.id)} style={styles.moreButton}>
                        <Ionicons name="flag-outline" size={16} color={colors.textSecondary} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteChore(chore.id)} style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  rewardsButton: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  choresList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  chores: {
    gap: 12,
  },
  choreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  choreInfo: {
    flex: 1,
  },
  choreTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  choreMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  difficultyBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  choreAssignee: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  choreAssigneeName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  choreDue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  choreDueText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  choreRecurring: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  choreRecurringText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  choreRight: {
    alignItems: "center",
    gap: 6,
  },
  chorePoints: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chorePointsText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#000",
  },
  moreButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
});
