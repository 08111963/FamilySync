import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Platform, Alert, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { WebPushTestButton } from "@/components/WebPushTestButton";
import { NativePushTestButton } from "@/components/NativePushTestButton";
import { apiRequest, queryClient } from "@/lib/query-client";
import { trackEvent } from "@/lib/test-analytics";

// Stessa palette usata in edit-profile per gli account: coerenza visiva.
const AVATAR_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#14B8A6",
  "#0EA5E9",
  "#3B82F6",
  "#84CC16",
  "#F97316",
  "#64748B",
];

// Ruoli consentiti per i profili gestiti (senza account): il backend rifiuta
// tutto il resto (mai promuovere un profilo gestito ad adulto/admin).
const MANAGED_ROLES = [
  { value: "child", label: "Figlio/a" },
  { value: "teen", label: "Adolescente" },
] as const;

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { data, currentFamily, setFamilyName, updateMember, deleteMember, getLeaderboard } = useFamily();
  const { logout, user } = useAuth();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(data.familyName);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editedMemberName, setEditedMemberName] = useState("");
  const [editedMemberColor, setEditedMemberColor] = useState<string>(AVATAR_COLORS[0]);
  const [editedMemberRole, setEditedMemberRole] = useState<string>("child");

  const leaderboard = getLeaderboard();
  const familyId = currentFamily?.id;

  const { data: prefsData } = useQuery<{ aiFeaturesEnabled: boolean }>({
    queryKey: ["/api/moderation/preferences"],
    enabled: !!user,
  });

  const { data: blocksData } = useQuery<{ id: string; blockedUserId: string; blockedUserName: string }[]>({
    queryKey: ["/api/moderation/blocks", familyId],
    enabled: !!familyId,
  });

  const blockedUserIds = new Set((blocksData || []).map((b) => b.blockedUserId));

  // Pannello analytics di test: visibile SOLO al proprietario dell'app
  // (allowlist APP_OWNER_EMAILS lato server). Per tutti gli altri la query
  // fallisce (403/404) e la voce non compare.
  const { data: analyticsAccess } = useQuery<{ allowed: boolean }>({
    queryKey: ["/api/admin/test-analytics/access"],
    enabled: !!user,
    retry: false,
  });

  // Pannello feedback tester: visibile SOLO al proprietario dell'app.
  const { data: feedbackAccess } = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/feedback/access"],
    enabled: !!user,
    retry: false,
  });

  const handleToggleAI = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest("PATCH", "/api/moderation/preferences", { aiFeaturesEnabled: value });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/preferences"] });
      trackEvent("ai_toggle_changed", { familyId, metadata: { enabled: value } });
    } catch {}
  };

  const handleBlockUser = async (blockedUserId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("POST", "/api/moderation/block", { familyId, blockedUserId });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/blocks", familyId] });
    } catch {}
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("DELETE", `/api/moderation/block/${familyId}/${blockedUserId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/blocks", familyId] });
    } catch {}
  };

  const handleMemberAction = (member: { id: string; userId: string | null; name: string }) => {
    if (member.userId === user?.id) return;
    // Profili bambino gestiti (senza account): niente segnala/blocca.
    if (!member.userId) return;
    const memberUserId = member.userId;
    const isBlocked = blockedUserIds.has(memberUserId);

    const goReport = () =>
      router.push({ pathname: "/report-user", params: { userId: memberUserId, familyId: familyId || "" } });
    const toggleBlock = () => {
      if (isBlocked) {
        handleUnblockUser(memberUserId);
      } else {
        handleBlockUser(memberUserId);
      }
    };

    if (Platform.OS === "web") {
      const choice = confirm(
        `${member.name}\n\n1. Segnala\n2. ${isBlocked ? "Sblocca" : "Blocca"}\n\nPremi OK per Segnala, Annulla per ${isBlocked ? "Sblocca" : "Blocca"}`
      );
      if (choice) {
        goReport();
      } else {
        toggleBlock();
      }
    } else {
      const buttons: any[] = [];
      buttons.push({ text: "Segnala", onPress: goReport });
      buttons.push({
        text: isBlocked ? "Sblocca" : "Blocca",
        style: isBlocked ? "default" : "destructive",
        onPress: toggleBlock,
      });
      buttons.push({ text: "Annulla", style: "cancel" });
      Alert.alert(member.name, "", buttons);
    }
  };

  const isAdmin = currentFamily?.myRole === "admin";
  // Genitori/adulti possono rinominare i profili bambino gestiti (senza account).
  const canManageProfiles = ["admin", "adult", "parent"].includes(currentFamily?.myRole || "");

  const handleSaveManagedMember = async (memberId: string) => {
    const name = editedMemberName.trim();
    if (name.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateMember(memberId, {
        name,
        color: editedMemberColor,
        role: editedMemberRole as any,
      });
      setEditingMemberId(null);
    } catch {
      if (Platform.OS === "web") {
        alert("Impossibile aggiornare il profilo. Riprova.");
      } else {
        Alert.alert("Errore", "Impossibile aggiornare il profilo. Riprova.");
      }
    }
  };

  const handleSaveName = () => {
    if (editedName.trim().length >= 2) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setFamilyName(editedName.trim());
      setIsEditingName(false);
    }
  };

  const handleDeleteMember = (memberId: string, memberName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      if (confirm(`Rimuovere ${memberName} dalla famiglia?`)) {
        deleteMember(memberId);
      }
    } else {
      Alert.alert(
        "Rimuovi Membro",
        `Sei sicuro di voler rimuovere ${memberName} dalla famiglia?`,
        [
          { text: "Annulla", style: "cancel" },
          { text: "Rimuovi", style: "destructive", onPress: () => deleteMember(memberId) },
        ]
      );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return { label: "Admin", color: colors.primary };
      case "adult":
        return { label: "Adulto", color: colors.primary };
      case "parent":
        return { label: "Genitore", color: colors.primary };
      case "teen":
        return { label: "Adolescente", color: colors.secondary };
      case "child":
        return { label: "Figlio/a", color: colors.secondary };
      default:
        return { label: "Membro", color: colors.textSecondary };
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
            <View style={styles.titleLeft}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{data.familyName}</Text>
              {isAdmin && (
                <Pressable onPress={() => setIsEditingName(true)}>
                  <Ionicons name="pencil" size={20} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                logout();
              }}
              style={({ pressed }) => [
                styles.headerLogoutButton,
                { borderColor: colors.error, opacity: pressed ? 0.6 : 1 },
              ]}
              testID="header-logout-button"
            >
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={[styles.headerLogoutText, { color: colors.error }]}>Esci</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Membri</Text>
          <Pressable
            onPress={() => router.push("/add-member")}
            style={({ pressed }) => [
              styles.addMemberButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addMemberText}>Aggiungi</Text>
          </Pressable>
        </View>

        {data.members.length === 0 ? (
          <Card>
            <EmptyState
              icon="people-outline"
              title="Nessun membro della famiglia"
              subtitle="Aggiungi i membri della tua famiglia per iniziare"
            />
          </Card>
        ) : (
          <View style={styles.membersList}>
            {data.members.map((member) => {
              const badge = getRoleBadge(member.role);
              const isSelf = member.userId === user?.id;
              const isManaged = !member.userId;
              const isEditingMember = editingMemberId === member.id;
              return (
                <Card key={member.id}>
                  <View style={styles.memberRow}>
                    <Avatar name={member.name} color={member.color} size={48} avatarUrl={member.avatarUrl} />
                    <View style={styles.memberInfo}>
                      {isEditingMember ? (
                        <>
                        <View style={styles.memberEditRow}>
                          <TextInput
                            style={[
                              styles.memberNameInput,
                              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                            ]}
                            value={editedMemberName}
                            onChangeText={setEditedMemberName}
                            autoFocus
                            keyboardAppearance={isDark ? "dark" : "light"}
                            testID={`member-name-input-${member.id}`}
                          />
                          <Pressable onPress={() => setEditingMemberId(null)} style={styles.actionButton}>
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleSaveManagedMember(member.id)}
                            style={styles.actionButton}
                            testID={`save-member-name-${member.id}`}
                          >
                            <Ionicons name="checkmark" size={22} color={colors.success} />
                          </Pressable>
                        </View>
                        <View style={styles.colorRow}>
                          {AVATAR_COLORS.map((c) => (
                            <Pressable
                              key={c}
                              onPress={() => setEditedMemberColor(c)}
                              style={[
                                styles.colorSwatch,
                                { backgroundColor: c },
                                editedMemberColor === c && { borderColor: colors.text, borderWidth: 2 },
                              ]}
                              testID={`member-color-${member.id}-${c.slice(1)}`}
                            />
                          ))}
                        </View>
                        <View style={styles.roleRow}>
                          {MANAGED_ROLES.map((r) => {
                            const active = editedMemberRole === r.value;
                            return (
                              <Pressable
                                key={r.value}
                                onPress={() => setEditedMemberRole(r.value)}
                                style={[
                                  styles.roleOption,
                                  {
                                    backgroundColor: active ? colors.primary : colors.surface,
                                    borderColor: active ? colors.primary : colors.border,
                                  },
                                ]}
                                testID={`member-role-${member.id}-${r.value}`}
                              >
                                <Text style={{ color: active ? "#FFFFFF" : colors.text, fontSize: 13, fontWeight: "600" }}>
                                  {r.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        </>
                      ) : (
                        <Text style={[styles.memberName, { color: colors.text }]}>
                          {member.name}
                          {isSelf ? " (tu)" : ""}
                        </Text>
                      )}
                      <View style={styles.memberMeta}>
                        <View style={[styles.roleBadge, { backgroundColor: badge.color + "20" }]}>
                          <Text style={[styles.roleBadgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                        {isManaged && (
                          <View
                            style={[styles.managedBadge, { backgroundColor: colors.textSecondary + "20" }]}
                            testID={`managed-badge-${member.id}`}
                          >
                            <Ionicons name="shield-checkmark-outline" size={11} color={colors.textSecondary} />
                            <Text style={[styles.roleBadgeText, { color: colors.textSecondary }]}>
                              Profilo gestito
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.memberPoints, { color: colors.textSecondary }]}>
                          {member.points} punti
                        </Text>
                      </View>
                      {isManaged && (
                        <Text style={[styles.managedHint, { color: colors.textSecondary }]}>
                          Senza account: gestito dai genitori
                        </Text>
                      )}
                    </View>
                    {isManaged && canManageProfiles && !isEditingMember ? (
                      <Pressable
                        onPress={() => {
                          setEditedMemberName(member.name);
                          setEditedMemberColor(member.color || AVATAR_COLORS[0]);
                          setEditedMemberRole(member.role === "teen" ? "teen" : "child");
                          setEditingMemberId(member.id);
                        }}
                        style={styles.actionButton}
                        testID={`rename-member-${member.id}`}
                      >
                        <Ionicons name="pencil" size={20} color={colors.primary} />
                      </Pressable>
                    ) : isSelf ? (
                      <Pressable
                        onPress={() => router.push("/edit-profile")}
                        style={styles.actionButton}
                        testID="edit-profile-button"
                      >
                        <Ionicons name="pencil" size={20} color={colors.primary} />
                      </Pressable>
                    ) : member.userId ? (
                      <Pressable
                        onPress={() => handleMemberAction(member)}
                        style={styles.actionButton}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                      </Pressable>
                    ) : null}
                    {!isSelf && (
                      <Pressable
                        onPress={() => handleDeleteMember(member.id, member.name)}
                        style={styles.deleteButton}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </Pressable>
                    )}
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
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Classifica</Text>
            <Pressable
              onPress={() => router.push("/rewards")}
              style={({ pressed }) => [styles.rewardsLink, { opacity: pressed ? 0.7 : 1 }]}
              hitSlop={8}
              testID="rewards-link-family"
            >
              <Ionicons name="gift-outline" size={18} color={colors.primary} />
              <Text style={[styles.rewardsLinkText, { color: colors.primary }]}>Premi</Text>
            </Pressable>
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
                    <Avatar name={member.name} color={member.color} size={40} avatarUrl={member.avatarUrl} />
                    <Text style={[styles.leaderboardName, { color: colors.text }]}>{member.name}</Text>
                  </View>
                  <Text style={[styles.leaderboardPoints, { color: colors.primary }]}>
                    {member.points} pt
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Statistiche</Text>
        </View>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.blue + "30" }]}>
              <Ionicons name="calendar" size={24} color={colors.calendar.blue} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{data.events.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Eventi</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.green + "30" }]}>
              <Ionicons name="cart" size={24} color={colors.calendar.green} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{data.shoppingLists.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Liste</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.calendar.purple + "30" }]}>
              <Ionicons name="checkmark-circle" size={24} color={colors.calendar.purple} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {data.chores.filter((c) => c.isCompleted).length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Fatte</Text>
          </Card>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Funzionalita</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Card>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.secondary + "20" }]}>
                <Ionicons name="sparkles-outline" size={24} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Funzionalita AI</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Consenti suggerimenti intelligenti tramite AI
                </Text>
              </View>
              <Switch
                value={prefsData?.aiFeaturesEnabled ?? false}
                onValueChange={handleToggleAI}
                trackColor={{ false: colors.border, true: colors.secondary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Card>
          <Card onPress={() => router.push("/premium")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: "#FFD60A30" }]}>
                <Ionicons name="diamond" size={24} color="#FFD60A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Premium</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Sblocca funzionalita avanzate
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/ai-insights")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="sparkles" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Consigli AI famiglia</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Consigli intelligenti per la famiglia
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/calendar-sync")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: "#34C75920" }]}>
                <Ionicons name="calendar-outline" size={24} color="#34C759" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Sincronizza calendario</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Collega Google/Apple Calendar e il telefono
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/blocked-users")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.error + "20" }]}>
                <Ionicons name="ban-outline" size={24} color={colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Utenti Bloccati</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Gestisci gli utenti bloccati
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          {analyticsAccess?.allowed && (
            <Card onPress={() => router.push("/admin/test-analytics")}>
              <View style={styles.featureLinkRow}>
                <View style={[styles.featureLinkIcon, { backgroundColor: "#5856D620" }]}>
                  <Ionicons name="analytics-outline" size={24} color="#5856D6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Test Analytics</Text>
                  <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                    Pannello interno riservato (periodo di test)
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </Card>
          )}
          {currentFamily?.myRole === "admin" && (
            <Card onPress={() => router.push("/admin-reports")}>
              <View style={styles.featureLinkRow}>
                <View style={[styles.featureLinkIcon, { backgroundColor: colors.warning + "20" }]}>
                  <Ionicons name="flag-outline" size={24} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Segnalazioni</Text>
                  <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                    Gestisci le segnalazioni della famiglia
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </Card>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Legale</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Card onPress={() => router.push("/privacy-center")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="lock-closed" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Centro Privacy</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Consenso AI, registro consensi e informative
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/legal/privacy")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.textSecondary + "15" }]}>
                <Ionicons name="shield-checkmark" size={24} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Privacy Policy</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Come trattiamo i tuoi dati
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/legal/terms")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.textSecondary + "15" }]}>
                <Ionicons name="document-text" size={24} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Termini d'Uso</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Condizioni di utilizzo del servizio
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/help/user-guide")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: "#4A90D920" }]}>
                <Ionicons name="book-outline" size={24} color="#4A90D9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Guida Utente</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Come usare tutte le funzionalita dell'app
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/contact-support")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="help-buoy-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Contatta assistenza</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Scrivici per problemi o domande
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          <Card onPress={() => router.push("/feedback")}>
            <View style={styles.featureLinkRow}>
              <View style={[styles.featureLinkIcon, { backgroundColor: "#FFB30020" }]}>
                <Ionicons name="star-half-outline" size={24} color="#FFB300" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Dacci il tuo parere</Text>
                <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                  Segnala bug, suggerisci funzioni, valuta l'app
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </Card>
          {feedbackAccess?.ok && (
            <Card onPress={() => router.push("/admin/feedback")}>
              <View style={styles.featureLinkRow}>
                <View style={[styles.featureLinkIcon, { backgroundColor: "#00B89420" }]}>
                  <Ionicons name="clipboard-outline" size={24} color="#00B894" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureLinkTitle, { color: colors.text }]}>Feedback ricevuti</Text>
                  <Text style={[styles.featureLinkSubtitle, { color: colors.textSecondary }]}>
                    Pannello riservato: bug e suggerimenti dei tester
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </Card>
          )}
          <WebPushTestButton />
          <NativePushTestButton />
        </View>
      </View>

      <View style={[styles.section, { marginBottom: 40 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/change-password");
          }}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginBottom: 12 },
          ]}
        >
          <Ionicons name="key-outline" size={20} color={colors.text} />
          <Text style={[styles.logoutText, { color: colors.text }]}>Cambia password</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/delete-account");
          }}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: colors.error, opacity: pressed ? 0.7 : 1, marginBottom: 12 },
          ]}
          testID="delete-account-link"
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Elimina account</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            logout();
          }}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: colors.error, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Esci</Text>
        </Pressable>
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
    justifyContent: "space-between",
    gap: 12,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerLogoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  headerLogoutText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
  rewardsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rewardsLinkText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
  managedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  managedHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  roleOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  memberEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  memberNameInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButton: {
    padding: 8,
  },
  actionButton: {
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
  featureLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  featureLinkTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  featureLinkSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
