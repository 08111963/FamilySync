import { useEffect, useState } from "react";
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

// Fasce orarie della giornata (in base a dueTime HH:MM)
type DayPart = "morning" | "afternoon" | "evening" | "noTime";
const DAY_PART_META: Record<DayPart, { label: string; icon: keyof typeof Ionicons.glyphMap; order: number }> = {
  morning: { label: "Mattina", icon: "sunny-outline", order: 0 },
  afternoon: { label: "Pomeriggio", icon: "partly-sunny-outline", order: 1 },
  evening: { label: "Sera", icon: "moon-outline", order: 2 },
  noTime: { label: "Senza orario", icon: "list-outline", order: 3 },
};

const dayPartFor = (dueTime?: string | null): DayPart => {
  if (!dueTime) return "noTime";
  const hour = Number(dueTime.split(":")[0]);
  if (!Number.isFinite(hour)) return "noTime";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};

// Le date sono confrontate in ORARIO LOCALE del dispositivo (mai UTC:
// dopo mezzanotte "oggi" sbaglierebbe giorno).
const toLocalIso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const localDateFromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shiftIso = (iso: string, days: number) => {
  const d = localDateFromIso(iso);
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
};

export default function ChoresScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, currentFamily, completeChore, deleteChore } = useFamily();
  const [filter, setFilter] = useState<FilterType>("all");
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const todayIso = toLocalIso(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  const familyId = currentFamily?.id || "";

  // Il filtro membro è legato alla famiglia attiva: se si cambia famiglia
  // va azzerato, altrimenti un ID "stantio" nasconderebbe tutte le faccende.
  useEffect(() => {
    setMemberFilter(null);
  }, [familyId]);

  // Difesa extra: se l'ID selezionato non esiste tra i membri correnti,
  // comportati come "Tutti".
  const effectiveMemberFilter =
    memberFilter && data.members.some((m) => m.id === memberFilter) ? memberFilter : null;

  // Filtro per membro (i cerchi in alto). Le faccende non assegnate
  // restano visibili solo con "Tutti".
  const memberChores = effectiveMemberFilter
    ? data.chores.filter((c) => c.assignedTo === effectiveMemberFilter)
    : data.chores;

  const statusMatches = (c: (typeof data.chores)[number]) => {
    if (filter === "pending") return !c.isCompleted;
    if (filter === "completed") return c.isCompleted;
    return true;
  };

  // Faccende del giorno selezionato + senza scadenza (sempre visibili)
  const dayChoresAll = memberChores.filter((c) => c.dueDate === selectedDate);
  const undatedAll = memberChores.filter((c) => !c.dueDate);
  const overdueAll = memberChores.filter(
    (c) => c.dueDate && c.dueDate < todayIso && !c.isCompleted
  );

  const dayChores = dayChoresAll.filter(statusMatches);
  const undated = undatedAll.filter(statusMatches);
  const overdue = selectedDate === todayIso ? overdueAll.filter(statusMatches) : [];

  // Barra di avanzamento: faccende del giorno + senza scadenza (a prescindere
  // dal filtro Da fare/Fatte, così 2/6 ha sempre senso)
  const progressChores = [...dayChoresAll, ...undatedAll];
  const progressDone = progressChores.filter((c) => c.isCompleted).length;
  const progressTotal = progressChores.length;
  const progressPoints = progressChores.reduce((sum, c) => sum + (c.points || 0), 0);
  const progressRatio = progressTotal > 0 ? progressDone / progressTotal : 0;

  // Sezioni per fascia oraria del giorno selezionato
  const partSections = (Object.keys(DAY_PART_META) as DayPart[])
    .map((part) => ({
      part,
      ...DAY_PART_META[part],
      chores: dayChores.filter((c) => dayPartFor(c.dueTime) === part),
    }))
    .filter((s) => s.chores.length > 0)
    .sort((a, b) => a.order - b.order);

  const dayLabel = (() => {
    if (selectedDate === todayIso) return "Oggi";
    if (selectedDate === shiftIso(todayIso, 1)) return "Domani";
    if (selectedDate === shiftIso(todayIso, -1)) return "Ieri";
    const label = localDateFromIso(selectedDate).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  })();

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
    if (dateStr === shiftIso(todayIso, 1)) return "Domani";
    return localDateFromIso(dateStr).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    return dateStr < todayIso;
  };

  const getFrequencyLabel = (frequency?: string) => recurrenceLabel(frequency);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const changeDay = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate((d) => shiftIso(d, delta));
  };

  const renderChore = (chore: (typeof data.chores)[number]) => {
    const member = getMember(chore.assignedTo);
    const dueDate = formatDueDate(chore.dueDate);
    const overdueFlag = isOverdue(chore.dueDate) && !chore.isCompleted;
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
                    color={overdueFlag ? colors.error : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.choreDueText,
                      { color: overdueFlag ? colors.error : colors.textSecondary },
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
  };

  const renderSectionHeader = (label: string, count: number, opts?: { icon?: keyof typeof Ionicons.glyphMap; danger?: boolean }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {opts?.icon && (
          <Ionicons
            name={opts.icon}
            size={15}
            color={opts?.danger ? colors.error : colors.textSecondary}
          />
        )}
        <Text
          style={[
            styles.sectionTitle,
            { color: opts?.danger ? colors.error : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
      </View>
      <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );

  const nothingToShow = overdue.length === 0 && dayChores.length === 0 && undated.length === 0;

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

      {/* Navigazione per giorno */}
      <View style={styles.dayNav}>
        <Pressable
          onPress={() => changeDay(-1)}
          style={[styles.dayArrow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="chores-day-prev"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.dayLabelBox}>
          <Text style={[styles.dayLabel, { color: colors.text }]}>{dayLabel}</Text>
          {selectedDate !== todayIso && (
            <Pressable onPress={() => setSelectedDate(todayIso)} testID="chores-day-today">
              <Text style={[styles.backToToday, { color: colors.primary }]}>Torna a oggi</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => changeDay(1)}
          style={[styles.dayArrow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          testID="chores-day-next"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Filtro membri famiglia */}
      {data.members.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.membersRow}
          contentContainerStyle={styles.membersRowContent}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMemberFilter(null);
            }}
            style={styles.memberChip}
            testID="chores-member-all"
          >
            <View
              style={[
                styles.memberAvatarWrap,
                {
                  borderColor: memberFilter === null ? colors.primary : "transparent",
                },
              ]}
            >
              <View style={[styles.allAvatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={20} color={colors.text} />
              </View>
            </View>
            <Text
              style={[
                styles.memberName,
                { color: memberFilter === null ? colors.text : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              Tutti
            </Text>
          </Pressable>
          {data.members.map((m) => {
            const active = memberFilter === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMemberFilter(active ? null : m.id);
                }}
                style={[styles.memberChip, { opacity: memberFilter && !active ? 0.45 : 1 }]}
                testID={`chores-member-${m.id}`}
              >
                <View
                  style={[
                    styles.memberAvatarWrap,
                    { borderColor: active ? colors.primary : "transparent" },
                  ]}
                >
                  <Avatar name={m.name} color={m.color} size={44} />
                </View>
                <Text
                  style={[
                    styles.memberName,
                    { color: active ? colors.text : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {m.name.split(" ")[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

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
        {/* Barra di avanzamento del giorno */}
        {progressTotal > 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.progressLabel, { color: colors.text }]}>
              {progressDone}/{progressTotal}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: `${Math.round(progressRatio * 100)}%` },
                ]}
              />
            </View>
            <View style={[styles.progressPoints, { backgroundColor: colors.accent }]}>
              <Ionicons name="star" size={13} color="#000" />
              <Text style={styles.progressPointsText}>{progressPoints}</Text>
            </View>
          </View>
        )}

        {nothingToShow ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={
              filter === "completed"
                ? "Nessuna faccenda completata"
                : `Nessuna faccenda per ${dayLabel === "Oggi" ? "oggi" : dayLabel.toLowerCase()}`
            }
            subtitle={
              filter === "pending" || filter === "all"
                ? "Aggiungi una faccenda o cambia giorno con le frecce"
                : "Completa alcune faccende per vederle qui"
            }
          />
        ) : (
          <View style={styles.chores}>
            {overdue.length > 0 && (
              <View>
                {renderSectionHeader("In ritardo", overdue.length, { icon: "alert-circle-outline", danger: true })}
                {overdue.map(renderChore)}
              </View>
            )}
            {partSections.map((section) => (
              <View key={section.part}>
                {renderSectionHeader(section.label, section.chores.length, { icon: section.icon })}
                {section.chores.map(renderChore)}
              </View>
            ))}
            {undated.length > 0 && (
              <View>
                {renderSectionHeader("Senza scadenza", undated.length, { icon: "infinite-outline" })}
                {undated.map(renderChore)}
              </View>
            )}
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
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    marginBottom: 12,
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
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  dayArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayLabelBox: {
    alignItems: "center",
  },
  dayLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  backToToday: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  membersRow: {
    flexGrow: 0,
    marginBottom: 10,
  },
  membersRowContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  memberChip: {
    alignItems: "center",
    width: 56,
  },
  memberAvatarWrap: {
    borderWidth: 2,
    borderRadius: 26,
    padding: 2,
  },
  allAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  memberName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
    maxWidth: 56,
    textAlign: "center",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
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
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressPoints: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  progressPointsText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#000",
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
