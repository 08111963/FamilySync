import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, TextInput, ActivityIndicator, Alert, Image, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { WebPushBanner } from "@/components/WebPushBanner";
import { AssistantChat } from "@/components/AssistantChat";
import { apiRequest, apiUpload, getApiErrorMessage, getApiUrl, queryClient } from "@/lib/query-client";
import { useMediaToken } from "@/hooks/useMediaToken";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const { data, isLoading, families, currentFamily, createFamily, getUpcomingEvents, getPendingChores, getLeaderboard, refetchAll } = useFamily();
  const { user, logout } = useAuth();
  const [familyName, setFamilyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [isUploadingFamilyPhoto, setIsUploadingFamilyPhoto] = useState(false);

  const upcomingEvents = getUpcomingEvents(3);
  const pendingChores = getPendingChores().slice(0, 3);
  const leaderboard = getLeaderboard().slice(0, 3);
  const familyId = data.familyId;
  const { mediaToken } = useMediaToken(familyId ?? undefined);
  const isChildAccount = user?.isChildAccount === true;
  const canEditFamilyPhoto = !!familyId && !isChildAccount;
  const hasFamilyPhoto = !!data.familyAvatarUrl;
  const todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const familyPhotoUri = (() => {
    if (!data.familyAvatarUrl || !mediaToken) return null;
    if (/^https?:\/\//i.test(data.familyAvatarUrl)) return data.familyAvatarUrl;
    try {
      const url = new URL(data.familyAvatarUrl, getApiUrl());
      if (mediaToken) url.searchParams.set("token", mediaToken);
      return url.toString();
    } catch {
      return null;
    }
  })();

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

  const showPhotoMessage = (title: string, message: string) => {
    if (Platform.OS === "web") {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const updateFamilyPhotoInCache = (avatarUrl: string | null) => {
    if (!familyId) return;
    queryClient.setQueryData<any[]>(["/api/families"], (previous) =>
      previous?.map((family) => family.id === familyId ? { ...family, avatarUrl } : family)
    );
    queryClient.setQueryData<any>(["/api/families", familyId], (previous: any) =>
      previous ? { ...previous, avatarUrl } : previous
    );
    refetchAll();
  };

  const uploadFamilyPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!familyId) return;
    setIsUploadingFamilyPhoto(true);
    try {
      const formData = new FormData();
      const ext = asset.uri.split(".").pop()?.split("?")[0] || "jpg";
      const fileName = `family_${Date.now()}.${ext}`;

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        formData.append("file", await response.blob(), fileName);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: fileName,
          type: asset.mimeType || `image/${ext}`,
        } as any);
      }

      const result = await apiUpload<{ avatarUrl: string }>(
        `/api/families/${familyId}/avatar`,
        formData,
      );
      updateFamilyPhotoInCache(result.avatarUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Errore upload foto famiglia:", error);
      showPhotoMessage(
        "Impossibile caricare la foto",
        getApiErrorMessage(error, "Riprova tra qualche istante."),
      );
    } finally {
      setIsUploadingFamilyPhoto(false);
    }
  };

  const handlePickFamilyPhoto = async () => {
    if (!canEditFamilyPhoto || isUploadingFamilyPhoto) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showPhotoMessage("Permesso necessario", "Serve il permesso per accedere alla galleria.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await uploadFamilyPhoto(result.assets[0]);
  };

  const removeFamilyPhoto = async () => {
    if (!familyId || isUploadingFamilyPhoto) return;
    setIsUploadingFamilyPhoto(true);
    try {
      await apiRequest("DELETE", `/api/families/${familyId}/avatar`);
      updateFamilyPhotoInCache(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Errore rimozione foto famiglia:", error);
      showPhotoMessage(
        "Impossibile rimuovere la foto",
        getApiErrorMessage(error, "Riprova tra qualche istante."),
      );
    } finally {
      setIsUploadingFamilyPhoto(false);
    }
  };

  const confirmRemoveFamilyPhoto = () => {
    if (!canEditFamilyPhoto || !hasFamilyPhoto) return;
    if (Platform.OS === "web") {
      if (confirm("Rimuovere la foto condivisa della famiglia?")) {
        void removeFamilyPhoto();
      }
      return;
    }
    Alert.alert(
      "Rimuovere la foto?",
      "Tutti i membri vedranno di nuovo l'icona della famiglia.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Rimuovi", style: "destructive", onPress: () => void removeFamilyPhoto() },
      ],
    );
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const isCompactHeader = windowWidth < 640;

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
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center" }}>
                Vivi da solo? Crea comunque il tuo spazio personale: tutte le funzioni si sbloccano subito e potrai invitare altri in qualsiasi momento.
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

  // Ruolo del membro corrente: serve all'assistente per avvisare sui premi
  // (creabili solo da admin/adult).
  const myRole = data.members.find((m) => m.userId === user?.id)?.role ?? null;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: 100 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.header}>
        <View style={[styles.familyHeaderRow, isCompactHeader && styles.familyHeaderRowCompact]}>
          {canEditFamilyPhoto ? (
            <Pressable
              onPress={handlePickFamilyPhoto}
              disabled={isUploadingFamilyPhoto}
              style={({ pressed }) => [
                styles.familyPhotoButton,
                isCompactHeader && styles.familyPhotoButtonCompact,
                { borderColor: colors.border, opacity: pressed || isUploadingFamilyPhoto ? 0.72 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={familyPhotoUri ? "Cambia foto della famiglia" : "Aggiungi foto della famiglia"}
              testID="home-family-photo-button"
            >
              {familyPhotoUri ? (
                <Image source={{ uri: familyPhotoUri }} style={styles.familyPhoto} />
              ) : (
                <View style={[styles.familyPhotoPlaceholder, { backgroundColor: colors.primary + "16" }]}>
                  {hasFamilyPhoto ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="people" size={30} color={colors.primary} />
                  )}
                </View>
              )}
              <View style={[styles.familyPhotoEditBadge, { backgroundColor: colors.primary }]}>
                {isUploadingFamilyPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                )}
              </View>
            </Pressable>
          ) : (
            <View style={[styles.familyPhotoButton, isCompactHeader && styles.familyPhotoButtonCompact, { borderColor: colors.border }]}>
              {familyPhotoUri ? (
                <Image source={{ uri: familyPhotoUri }} style={styles.familyPhoto} />
              ) : (
                <View style={[styles.familyPhotoPlaceholder, { backgroundColor: colors.primary + "16" }]}>
                  {hasFamilyPhoto ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="people" size={30} color={colors.primary} />
                  )}
                </View>
              )}
            </View>
          )}
          <View style={styles.familyHeaderContent}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Bentornata famiglia</Text>
            <Text style={[styles.title, isCompactHeader && styles.titleCompact, { color: colors.text }]} numberOfLines={1}>{data.familyName}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {data.members.length} membr{data.members.length !== 1 ? "i" : "o"}
            </Text>
            {canEditFamilyPhoto && (
              <View style={styles.familyPhotoActions}>
                <Pressable
                  onPress={handlePickFamilyPhoto}
                  disabled={isUploadingFamilyPhoto}
                  hitSlop={8}
                  testID="home-family-photo-change"
                >
                  <Text style={[styles.familyPhotoActionText, { color: colors.primary }]}>
                    {hasFamilyPhoto ? "Cambia foto" : "Aggiungi foto"}
                  </Text>
                </Pressable>
                {hasFamilyPhoto && (
                  <Pressable
                    onPress={confirmRemoveFamilyPhoto}
                    disabled={isUploadingFamilyPhoto}
                    hitSlop={8}
                    testID="home-family-photo-remove"
                  >
                    <Text style={[styles.familyPhotoActionText, { color: colors.error }]}>Rimuovi</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          <View style={[
            styles.familyDateBlock,
            isCompactHeader && styles.familyDateBlockCompact,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
            <View style={[styles.familyDateIcon, { backgroundColor: colors.primary + "16" }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.familyDateText}>
              <Text style={[styles.familyDateLabel, { color: colors.textSecondary }]}>Oggi</Text>
              <Text style={[styles.todayDate, { color: colors.text }]} numberOfLines={2} testID="home-today-date">
                {todayLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {Platform.OS === "web" && <WebPushBanner />}

      <Pressable
        onPress={() => router.push("/feedback")}
        style={({ pressed }) => [
          styles.feedbackBanner,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        testID="home-feedback-banner"
      >
        <Ionicons name="star-half-outline" size={18} color="#FFB300" />
        <Text style={[styles.feedbackBannerText, { color: colors.text }]} numberOfLines={1}>
          Dacci il tuo parere: segnala bug o suggerisci idee
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prossimi Eventi</Text>
          <Pressable onPress={() => router.push("/(app)/(tabs)/calendar")}>
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
                onPress={() => router.push(`/add-event?eventId=${event.id}`)}
              >
                <View style={[styles.eventColorBar, { backgroundColor: event.color }]} />
                <View style={styles.eventContent}>
                  <View style={styles.eventTitleRow}>
                    <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                    {event.visibility === "private" && (
                      <View style={[styles.privateBadge, { backgroundColor: colors.primary + "18" }]}>
                        <Ionicons name="lock-closed-outline" size={12} color={colors.primary} />
                        <Text style={[styles.privateBadgeText, { color: colors.primary }]}>Solo tu</Text>
                      </View>
                    )}
                  </View>
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
          <Pressable onPress={() => router.push("/(app)/(tabs)/chores")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Vedi tutte</Text>
          </Pressable>
        </View>
        {pendingChores.length === 0 ? (
          <Card onPress={() => router.push("/(app)/(tabs)/chores")}>
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
                  onPress={() => router.push("/(app)/(tabs)/chores")}
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
                    <Avatar name={member.name} color={member.color} size={36} avatarUrl={member.avatarUrl} />
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
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/ai-insights");
            }}
            style={({ pressed }) => [
              styles.quickAction,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
            testID="home-ai-insights"
          >
            <View style={[styles.quickActionIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="sparkles" size={22} color={colors.primary} />
            </View>
            <View style={styles.quickActionInfo}>
              <Text style={[styles.quickActionTitle, { color: colors.text }]}>Suggerimenti AI</Text>
              <Text style={[styles.quickActionSubtitle, { color: colors.textSecondary }]}>
                Consigli intelligenti per la famiglia
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
    {currentFamily && <AssistantChat familyId={currentFamily.id} memberRole={myRole} />}
    </View>
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
  familyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  familyHeaderRowCompact: {
    flexWrap: "wrap",
    gap: 12,
  },
  familyPhotoButton: {
    width: 76,
    height: 76,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "visible",
    position: "relative",
  },
  familyPhotoButtonCompact: {
    width: 68,
    height: 68,
    borderRadius: 20,
  },
  familyPhoto: {
    width: "100%",
    height: "100%",
    borderRadius: 21,
  },
  familyPhotoPlaceholder: {
    flex: 1,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  familyPhotoEditBadge: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    right: -6,
    bottom: -6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  familyHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  titleCompact: {
    fontSize: 26,
  },
  familyDateBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 178,
    maxWidth: 250,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
  },
  familyDateBlockCompact: {
    flexBasis: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  familyDateIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  familyDateText: {
    flex: 1,
    minWidth: 0,
  },
  familyDateLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  todayDate: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  familyPhotoActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
  familyPhotoActionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  feedbackBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  },
  eventTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  privateBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
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
