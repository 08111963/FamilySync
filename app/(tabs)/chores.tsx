import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";

type FilterType = "all" | "pending" | "completed";

export default function ChoresScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, completeChore, deleteChore } = useFamily();
  const [filter, setFilter] = useState<FilterType>("pending");

  const filteredChores = data.chores.filter((chore) => {
    if (filter === "pending") return !chore.isCompleted;
    if (filter === "completed") return chore.isCompleted;
    return true;
  });

  const getMember = (memberId: string) => {
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

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === today.toISOString().split("T")[0]) return "Today";
    if (dateStr === tomorrow.toISOString().split("T")[0]) return "Tomorrow";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isOverdue = (dateStr?: string) => {
    if (!dateStr) return false;
    return dateStr < new Date().toISOString().split("T")[0];
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Chores</Text>
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
              {f.charAt(0).toUpperCase() + f.slice(1)}
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
            title={filter === "completed" ? "No completed chores" : "No pending chores"}
            subtitle={filter === "pending" ? "Add a chore to get started" : "Complete some chores to see them here"}
          />
        ) : (
          <View style={styles.chores}>
            {filteredChores.map((chore) => {
              const member = getMember(chore.assignedTo);
              const dueDate = formatDueDate(chore.dueDate);
              const overdue = isOverdue(chore.dueDate) && !chore.isCompleted;

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
                            </Text>
                          </View>
                        )}
                        {chore.isRecurring && (
                          <View style={styles.choreRecurring}>
                            <Ionicons name="repeat" size={14} color={colors.secondary} />
                            <Text style={[styles.choreRecurringText, { color: colors.secondary }]}>
                              {chore.frequency}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.choreRight}>
                      <View style={[styles.chorePoints, { backgroundColor: colors.accent }]}>
                        <Text style={styles.chorePointsText}>{chore.points}</Text>
                      </View>
                      <Pressable onPress={() => handleDeleteChore(chore.id)} style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  </View>
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
  container: {
    flex: 1,
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
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
    gap: 12,
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
    gap: 8,
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
  deleteButton: {
    padding: 4,
  },
});
