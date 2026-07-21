import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/Card";

interface Reward {
  id: string;
  title: string;
  description?: string | null;
  pointsCost: number;
}

interface Redemption {
  id: string;
  rewardTitle: string;
  pointsSpent: number;
  redeemedAt: string;
  memberId: string;
}

interface RewardsData {
  rewards: Reward[];
  redemptions: Redemption[];
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { currentFamily, data, refetchAll } = useFamily();
  const qc = useQueryClient();

  const familyId = currentFamily?.id || "";
  const myMember = data.members.find((m) => m.userId === user?.id);
  const myPoints = myMember?.points ?? 0;
  const canManage = myMember?.role === "admin" || myMember?.role === "adult";

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pointsCost, setPointsCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const rewardsQuery = useQuery<RewardsData>({
    queryKey: [`/api/rewards/${familyId}`],
    enabled: !!familyId,
  });

  const rewards = rewardsQuery.data?.rewards ?? [];
  const redemptions = rewardsQuery.data?.redemptions ?? [];

  const memberName = (memberId: string) => {
    const m = data.members.find((mm) => mm.id === memberId);
    return m?.nickname || m?.name || "Membro";
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: [`/api/rewards/${familyId}`] });
    refetchAll();
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreate = async () => {
    const cost = parseInt(pointsCost, 10);
    if (!title.trim()) {
      Alert.alert("Attenzione", "Inserisci il nome del premio");
      return;
    }
    if (!Number.isFinite(cost) || cost < 1) {
      Alert.alert("Attenzione", "Inserisci un costo in punti valido (almeno 1)");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", `/api/rewards/${familyId}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        pointsCost: cost,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle("");
      setDescription("");
      setPointsCost("");
      setShowForm(false);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile creare il premio");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (rewardId: string) => {
    try {
      await apiRequest("DELETE", `/api/rewards/${familyId}/${rewardId}`);
      await refresh();
    } catch (error: any) {
      Alert.alert("Errore", error?.body?.error?.message || "Impossibile eliminare il premio");
    }
  };

  const handleDelete = (reward: Reward) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "web") {
      if (confirm(`Eliminare il premio "${reward.title}"?`)) doDelete(reward.id);
    } else {
      Alert.alert("Elimina premio", `Vuoi eliminare "${reward.title}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => doDelete(reward.id) },
      ]);
    }
  };

  const doRedeem = async (reward: Reward) => {
    setRedeemingId(reward.id);
    try {
      await apiRequest("POST", `/api/rewards/${familyId}/${reward.id}/redeem`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      Alert.alert("Premio riscattato! 🎉", `Hai riscattato "${reward.title}".`);
    } catch (error: any) {
      const code = error?.body?.error?.code;
      Alert.alert(
        "Errore",
        code === "INSUFFICIENT_POINTS"
          ? "Non hai abbastanza punti per questo premio."
          : error?.body?.error?.message || "Impossibile riscattare il premio"
      );
    } finally {
      setRedeemingId(null);
    }
  };

  const handleRedeem = (reward: Reward) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (myPoints < reward.pointsCost) {
      Alert.alert("Punti insufficienti", `Ti servono ${reward.pointsCost - myPoints} punti in più per questo premio.`);
      return;
    }
    if (Platform.OS === "web") {
      if (confirm(`Riscattare "${reward.title}" per ${reward.pointsCost} punti?`)) doRedeem(reward);
    } else {
      Alert.alert("Riscatta premio", `Vuoi riscattare "${reward.title}" per ${reward.pointsCost} punti?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Riscatta", onPress: () => doRedeem(reward) },
      ]);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="rewards-back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Premi</Text>
        {canManage ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowForm((v) => !v);
            }}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            testID="rewards-add"
          >
            <Ionicons name={showForm ? "close" : "add"} size={24} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.addButton} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
      >
        <Card style={styles.pointsCard}>
          <Ionicons name="star" size={28} color="#FFB300" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>I tuoi punti</Text>
            <Text style={[styles.pointsValue, { color: colors.text }]}>{myPoints}</Text>
          </View>
        </Card>

        {showForm && canManage && (
          <Card style={styles.formCard}>
            <Text style={[styles.formTitle, { color: colors.text }]}>Nuovo premio</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Nome del premio (es. Serata film a scelta)"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
              testID="reward-title-input"
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Descrizione (facoltativa)"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Costo in punti (es. 50)"
              placeholderTextColor={colors.textSecondary}
              value={pointsCost}
              onChangeText={(t) => setPointsCost(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={6}
              testID="reward-cost-input"
            />
            <Pressable
              onPress={handleCreate}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.primary, opacity: pressed || saving ? 0.8 : 1 },
              ]}
              testID="reward-save"
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Crea premio</Text>
              )}
            </Pressable>
          </Card>
        )}

        {rewardsQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : rewards.length === 0 ? (
          <EmptyState
            icon="gift-outline"
            title="Nessun premio"
            subtitle={
              canManage
                ? "Crea il primo premio con il pulsante + in alto: i familiari potranno riscattarlo con i punti delle faccende."
                : "Non ci sono ancora premi. Chiedi a un adulto della famiglia di crearne uno!"
            }
          />
        ) : (
          <View style={styles.section}>
            {rewards.map((reward) => {
              const affordable = myPoints >= reward.pointsCost;
              return (
                <Card key={reward.id} style={styles.rewardCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rewardTitle, { color: colors.text }]}>{reward.title}</Text>
                    {!!reward.description && (
                      <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
                        {reward.description}
                      </Text>
                    )}
                    <View style={styles.costRow}>
                      <Ionicons name="star" size={14} color="#FFB300" />
                      <Text style={[styles.costText, { color: colors.textSecondary }]}>
                        {reward.pointsCost} punti
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rewardActions}>
                    <Pressable
                      onPress={() => handleRedeem(reward)}
                      disabled={redeemingId === reward.id}
                      style={({ pressed }) => [
                        styles.redeemButton,
                        {
                          backgroundColor: affordable ? colors.primary : colors.surface,
                          borderWidth: affordable ? 0 : 1,
                          borderColor: colors.border,
                          opacity: pressed || redeemingId === reward.id ? 0.7 : 1,
                        },
                      ]}
                      testID={`redeem-${reward.id}`}
                    >
                      {redeemingId === reward.id ? (
                        <ActivityIndicator size="small" color={affordable ? "#FFFFFF" : colors.text} />
                      ) : (
                        <Text style={[styles.redeemText, { color: affordable ? "#FFFFFF" : colors.textSecondary }]}>
                          Riscatta
                        </Text>
                      )}
                    </Pressable>
                    {canManage && (
                      <Pressable onPress={() => handleDelete(reward)} hitSlop={8} style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {redemptions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Riscatti recenti</Text>
            {redemptions.map((r) => (
              <View key={r.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                <Ionicons name="gift" size={16} color={colors.primary} />
                <Text style={[styles.historyText, { color: colors.text }]} numberOfLines={1}>
                  {memberName(r.memberId)} · {r.rewardTitle}
                </Text>
                <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
                  -{r.pointsSpent} pt · {formatDate(r.redeemedAt)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pointsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
  },
  pointsLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pointsValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  formCard: { marginHorizontal: 20, marginBottom: 12, padding: 16, gap: 10 },
  formTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  section: { paddingHorizontal: 20, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 10,
  },
  rewardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rewardDescription: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  costText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  rewardActions: { alignItems: "center", gap: 8 },
  redeemButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: "center",
  },
  redeemText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  deleteButton: { padding: 4 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  historyMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
