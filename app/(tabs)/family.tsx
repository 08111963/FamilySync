import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { data, setFamilyName, deleteMember, getLeaderboard } = useFamily();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(data.familyName);

  const leaderboard = getLeaderboard();

  const handleSaveName = () => {
    if (editedName.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setFamilyName(editedName.trim());
      setIsEditingName(false);
    }
  };

  const handleDeleteMember = (memberId: string, memberName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      if (confirm(`Remove ${memberName} from the family?`)) {
        deleteMember(memberId);
      }
    } else {
      Alert.alert(
        "Remove Member",
        `Are you sure you want to remove ${memberName} from the family?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => deleteMember(memberId) },
        ]
      );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "parent":
        return { label: "Parent", color: colors.primary };
      case "child":
        return { label: "Child", color: colors.secondary };
      default:
        return { label: "Member", color: colors.textSecondary };
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: 100 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        {isEditingName ? (
          <View style={styles.editNameContainer}>
            <TextInput
              style={[
                styles.nameInput,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
              value={editedName}
              onChangeText={setEditedName}
              autoFocus
              keyboardAppearance={isDark ? "dark" : "light"}
            />
            <View style={styles.editButtons}>
              <Pressable onPress={() => setIsEditingName(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleSaveName}>
                <Ionicons name="checkmark" size={24} color={colors.success} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>{data.familyName}</Text>
            <Pressable onPress={() => setIsEditingName(true)}>
              <Ionicons name="pencil" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
          <Pressable
            onPress={() => router.push("/add-member")}
            style={({ pressed }) => [
              styles.addMemberButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addMemberText}>Add</Text>
          </Pressable>
        </View>

        {data.members.length === 0 ? (
          <Card>
            <EmptyState
              icon="people-outline"
              title="No family members"
              subtitle="Add your family members to get started"
            />
          </Card>
        ) : (
          <View style={styles.membersList}>
            {data.members.map((member) => {
              const badge = getRoleBadge(member.role);
              return (
                <Card key={member.id}>
                  <View style={styles.memberRow}>
                    <Avatar name={member.name} color={member.color} size={48} />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                      <View style={styles.memberMeta}>
                        <View style={[styles.roleBadge, { backgroundColor: badge.color + "20" }]}>
                          <Text style={[styles.roleBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                        <Text style={[styles.memberPoints, { color: colors.textSecondary }]}>
                          {member.points} points
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteMember(member.id, member.name)}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      {leaderboard.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Leaderboard</Text>
            <Ionicons name="trophy" size={20} color={colors.accent} />
          </View>

          <Card>
            <View style={styles.leaderboard}>
              {leaderboard.map((member, index) => (
                <View key={member.id} style={styles.leaderboardRow}>
                  <View style={styles.leaderboardLeft}>
                    <View
                      style={[
                        styles.rankBadge,
                        {
                          backgroundColor:
                            index === 0
                              ? colors.accent
                              : index === 1
                              ? "#C0C0C0"
                              : index === 2
                              ? "#CD7F32"
                              : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.rankText}>{index + 1}</Text>
                    </View>
                    <Avatar name={member.name} color={member.color} size={40} />
                    <Text style={[styles.leaderboardName, { color: colors.text }]}>{member.name}</Text>
                  </View>
                  <Text style={[styles.leaderboardPoints, { color: colors.primary }]}>
                    {member.points} pts
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Statistics</Text>
        </View>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.blue + "30" }]}>
              <Ionicons name="calendar" size={24} color={colors.calendar.blue} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{data.events.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Events</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.green + "30" }]}>
              <Ionicons name="cart" size={24} color={colors.calendar.green} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{data.shoppingLists.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Lists</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.purple + "30" }]}>
              <Ionicons name="checkmark-circle" size={24} color={colors.calendar.purple} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {data.chores.filter((c) => c.isCompleted).length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Done</Text>
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  editNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  editButtons: {
    flexDirection: "row",
    gap: 12,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  addMemberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addMemberText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  membersList: {
    gap: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  memberMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  memberPoints: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  deleteButton: {
    padding: 8,
  },
  leaderboard: {
    gap: 16,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaderboardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  leaderboardName: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  leaderboardPoints: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 16,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
