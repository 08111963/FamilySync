import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, getUpcomingEvents, getPendingChores, getLeaderboard } = useFamily();

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

  const getMemberName = (memberId: string) => {
    const member = data.members.find((m) => m.id === memberId);
    return member?.name || "Non assegnato";
  };

  const getMemberColor = (memberId: string) => {
    const member = data.members.find((m) => m.id === memberId);
    return member?.color || colors.primary;
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

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
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Nessun evento in programma"
              subtitle="Aggiungi eventi per tenere la famiglia sincronizzata"
            />
          </Card>
        ) : (
          <View style={styles.eventsList}>
            {upcomingEvents.map((event) => (
              <Card key={event.id} style={styles.eventCard}>
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
          <Card>
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
                <Card key={chore.id} style={styles.choreCard}>
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
});
