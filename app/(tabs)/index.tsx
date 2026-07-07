import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, isLoading, families, createFamily, getUpcomingEvents, getPendingChores, getLeaderboard } = useFamily();
  const { user, logout } = useAuth();
  const [familyName, setFamilyName] = useState("");
  const [creating, setCreating] = useState(false);

  const upcomingEvents = getUpcomingEvents(3);
  const pendingChores = getPendingChores().slice(0, 3);
  const leaderboard = getLeaderboard().slice(0, 3);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === today.toISOString().split("T")[0]) return "Oggi";
    if (dateStr === tomorrow.toISOString().split("T")[0]) return "Domani";
    return date.toLocaleDateString("it-IT", { weekday: "short", month: "short", day: "numeric" });
  };

  const getMemberName = (memberId: string | null | undefined) => {
    const member = data.members.find((m) => m.id === memberId);
    return member?.name || "Non assegnato";
  };

  const getMemberColor = (memberId: string | null | undefined) => {
    const member = data.members.find((m) => m.id === memberId);
    return member?.color || colors.primary;
  };

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return;
    setCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await createFamily(familyName.trim());
      setFamilyName("");
    } catch (error) {
      console.error("Error creating family:", error);
    } finally {
      setCreating(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (families.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: 100 }}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Benvenuto{user?.name ? `, ${user.name}` : ""}!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Crea la tua famiglia per iniziare
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <Card>
            <View style={{ gap: 16 }}>
              <Ionicons name="people" size={48} color={colors.primary} style={{ alignSelf: "center" }} />
              <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center" }}>
                Crea la tua Famiglia
              </Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center" }}>
                Inizia a coordinare eventi, spesa e faccende con la tua famiglia
              </Text>
              <TextInput
                style={{
                  height: 48,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  paddingHorizontal: 16,
                  fontSize: 16,
                  fontFamily: "Inter_400Regular",
                  color: colors.text,
                }}
                placeholder="Nome della famiglia..."
                placeholderTextColor={colors.textSecondary}
                value={familyName}
                onChangeText={setFamilyName}
              />
              <Pressable
                onPress={handleCreateFamily}
                disabled={!familyName.trim() || creating}
                style={({ pressed }) => ({
                  backgroundColor: familyName.trim() ? colors.primary : colors.border,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
                    Crea Famiglia
                  </Text>
                )}
              </Pressable>
            </View>
          </Card>
        </View>
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Pressable onPress={logout} style={{ alignItems: "center", paddingVertical: 12 }}>
            <Text style={{ color: colors.error, fontSize: 14, fontFamily: "Inter_500Medium" }}>Esci</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: 100 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{data.familyName}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {data.members.length} membr{data.members.length !== 1 ? "i" : "o"}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prossimi Eventi</Text>
          <Pressable onPress={() => router.push("/(tabs)/calendar")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Vedi tutti</Text>
          </Pressable>
        </View>
        {upcomingEvents.length === 0 ? (
          <Card onPress={() => router.push("/add-event")}>
            <EmptyState
              icon="calendar-outline"
              title="Nessun evento in programma"
              subtitle="Aggiungi eventi per tenere la famiglia sincronizzata"
            />
          </Card>
        ) : (
          <View style={styles.eventsList}>
            {upcomingEvents.map((event) => (
              <Card
                key={event.id}
                style={styles.eventCard}
                onPress={() => router.push("/add-event")}
              >
                <View style={[styles.eventColorBar, { backgroundColor: event.color }]} />
                <View style={styles.eventContent}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <View style={styles.eventMeta}>
                    <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                      {formatDate(event.date)}
                      {event.time && ` alle ${event.time}`}
                    </Text>
                    <Text style={[styles.eventMember, { color: getMemberColor(event.memberId) }]}>
                      {getMemberName(event.memberId)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Faccende da Fare</Text>
          <Pressable onPress={() => router.push("/(tabs)/chores")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Vedi tutte</Text>
          </Pressable>
        </View>
        {pendingChores.length === 0 ? (
          <Card onPress={() => router.push("/(tabs)/chores")}>
            <EmptyState
              icon="checkmark-circle-outline"
              title="Tutto fatto!"
              subtitle="Nessuna faccenda in sospeso al momento"
            />
          </Card>
        ) : (
          <View style={styles.choresList}>
            {pendingChores.map((chore) => {
              const member = data.members.find((m) => m.id === chore.assignedTo);
              return (
                <Card
                  key={chore.id}
                  style={styles.choreCard}
                  onPress={() => router.push("/(tabs)/chores")}
                >
                  <View style={styles.choreContent}>
                    <View style={styles.choreInfo}>
                      <Text style={[styles.choreTitle, { color: colors.text }]}>{chore.title}</Text>
                      <Text style={[styles.choreAssigned, { color: colors.textSecondary }]}>
                        {member?.name || "Non assegnato"}
                      </Text>
                    </View>
                    <View style={[styles.chorePoints, { backgroundColor: colors.accent }]}>
                      <Text style={styles.chorePointsText}>{chore.points} pt</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Classifica</Text>
          <Ionicons name="trophy" size={20} color={colors.accent} />
        </View>
        {leaderboard.length === 0 ? (
          <Card>
            <EmptyState
              icon="people-outline"
              title="Nessun membro della famiglia"
              subtitle="Aggiungi membri per iniziare a tracciare i punti"
            />
          </Card>
        ) : (
          <Card>
            <View style={styles.leaderboard}>
              {leaderboard.map((member, index) => (
                <View key={member.id} style={styles.leaderboardItem}>
                  <View style={styles.leaderboardLeft}>
                    <Text style={[styles.leaderboardRank, { color: colors.textSecondary }]}>
                      {index + 1}
                    </Text>
                    <Avatar name={member.name} color={member.color} size={36} />
                    <Text style={[styles.leaderboardName, { color: colors.text }]}>{member.name}</Text>
                  </View>
                  <Text style={[styles.leaderboardPoints, { color: colors.primary }]}>
                    {member.points} pt
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Cucina</Text>
          <Ionicons name="restaurant" size={20} color={colors.secondary} />
        </View>
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/recipes");
            }}
            style={({ pressed }) => [
              styles.quickAction,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: colors.secondary + "20" }]}>
              <Ionicons name="book" size={22} color={colors.secondary} />
            </View>
            <View style={styles.quickActionInfo}>
              <Text style={[styles.quickActionTitle, { color: colors.text }]}>Ricette</Text>
              <Text style={[styles.quickActionSubtitle, { color: colors.textSecondary }]}>
                Gestisci le ricette della famiglia
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/meal-plans");
            }}
            style={({ pressed }) => [
              styles.quickAction,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: colors.accent + "20" }]}>
              <Ionicons name="nutrition" size={22} color={colors.accent} />
            </View>
            <View style={styles.quickActionInfo}>
              <Text style={[styles.quickActionTitle, { color: colors.text }]}>Piano Pasti</Text>
              <Text style={[styles.quickActionSubtitle, { color: colors.textSecondary }]}>
                Pianifica i pasti della settimana
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
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
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
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
  seeAll: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  eventsList: {
    gap: 12,
  },
  eventCard: {
    flexDirection: "row",
    padding: 0,
    overflow: "hidden",
  },
  eventColorBar: {
    width: 4,
  },
  eventContent: {
    flex: 1,
    padding: 16,
  },
  eventTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eventDate: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  eventMember: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  choresList: {
    gap: 12,
  },
  choreCard: {
    padding: 16,
  },
  choreContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choreInfo: {
    flex: 1,
  },
  choreTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  choreAssigned: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  chorePoints: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chorePointsText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#000",
  },
  leaderboard: {
    gap: 16,
  },
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaderboardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  leaderboardRank: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    width: 24,
  },
  leaderboardName: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  leaderboardPoints: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionInfo: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
