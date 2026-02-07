import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { apiRequest, queryClient } from "@/lib/query-client";

interface BlockedUser {
  id: string;
  blockedUserId: string;
  blockedUserName: string;
  createdAt: string;
}

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const familyId = currentFamily?.id;

  const { data: blockedUsers, isLoading } = useQuery<BlockedUser[]>({
    queryKey: ["/api/moderation/blocks", familyId],
    enabled: !!familyId,
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleUnblock = (blockedUserId: string, name: string) => {
    const doUnblock = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await apiRequest("DELETE", `/api/moderation/block/${familyId}/${blockedUserId}`);
        queryClient.invalidateQueries({ queryKey: ["/api/moderation/blocks", familyId] });
      } catch {}
    };

    if (Platform.OS === "web") {
      if (confirm(`Sbloccare ${name}?`)) {
        doUnblock();
      }
    } else {
      Alert.alert("Sblocca Utente", `Sei sicuro di voler sbloccare ${name}?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Sblocca", onPress: doUnblock },
      ]);
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
        <Text style={[styles.title, { color: colors.text }]}>Utenti Bloccati</Text>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Card>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Caricamento...</Text>
          </Card>
        ) : !blockedUsers || blockedUsers.length === 0 ? (
          <Card>
            <EmptyState
              icon="ban-outline"
              title="Nessun utente bloccato"
              subtitle="Gli utenti che blocchi appariranno qui"
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {blockedUsers.map((blocked) => (
              <Card key={blocked.id}>
                <View style={styles.blockedRow}>
                  <Avatar name={blocked.blockedUserName} color="#B2BEC3" size={44} />
                  <View style={styles.blockedInfo}>
                    <Text style={[styles.blockedName, { color: colors.text }]}>
                      {blocked.blockedUserName}
                    </Text>
                    <Text style={[styles.blockedDate, { color: colors.textSecondary }]}>
                      Bloccato il {new Date(blocked.createdAt).toLocaleDateString("it-IT")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleUnblock(blocked.blockedUserId, blocked.blockedUserName)}
                    style={({ pressed }) => [
                      styles.unblockButton,
                      { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.unblockText, { color: colors.primary }]}>Sblocca</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
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
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
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
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  blockedInfo: {
    flex: 1,
  },
  blockedName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  blockedDate: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  unblockText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
