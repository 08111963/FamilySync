import { useMemo, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator, Alert, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PurchasesPackage } from "react-native-purchases";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { useSubscription, isRevenueCatTestMode } from "@/lib/revenuecat";

type PlanFeature = { label: string; free: string; premium: string };

const PLAN_FEATURES: PlanFeature[] = [
  { label: "Suggerimenti spesa AI", free: "2 / giorno", premium: "10 / giorno" },
  { label: "Ricerca ricette AI", free: "2 / giorno", premium: "20 / giorno" },
  { label: "Idee ricette AI", free: "1 / giorno", premium: "10 / giorno" },
  { label: "Piano pasti AI", free: "1 / settimana", premium: "3 / giorno" },
  { label: "Consigli AI famiglia", free: "1 / settimana", premium: "5 / giorno" },
  { label: "Ottimizzazione faccende AI", free: "1 / giorno", premium: "10 / giorno" },
  { label: "Calendario, spesa, faccende, chat", free: "Illimitato", premium: "Illimitato" },
  { label: "Supporto prioritario", free: "—", premium: "Incluso" },
];

const FALLBACK_MONTHLY = "€3,99";
const FALLBACK_YEARLY = "€39,99";

type PlanChoice = "monthly" | "yearly";

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const queryClient = useQueryClient();
  const { offerings, purchase, restore, isPurchasing, isRestoring } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>("yearly");
  const [confirmPkg, setConfirmPkg] = useState<PurchasesPackage | null>(null);

  const familyId = currentFamily?.id;
  const role = currentFamily?.myRole;
  const canPurchase = role === "owner" || role === "admin";
  const working = isPurchasing || isRestoring;

  const statusQuery = useQuery<any>({
    queryKey: ["/api/purchases/status", familyId],
    enabled: !!familyId,
  });

  // Fonte di verità UNICA: /api/purchases/status (derivato da entitlements).
  const isPremium = statusQuery.data?.premium === true;
  const expiresAt = statusQuery.data?.expiresAt as string | null | undefined;

  // Prezzi e package presi dall'offering RevenueCat (mai hardcoded).
  const packages = offerings?.current?.availablePackages ?? [];
  const monthlyPkg = useMemo(
    () => packages.find((p) => p.packageType === "MONTHLY") ?? packages.find((p) => p.identifier === "$rc_monthly"),
    [packages],
  );
  const yearlyPkg = useMemo(
    () => packages.find((p) => p.packageType === "ANNUAL") ?? packages.find((p) => p.identifier === "$rc_annual"),
    [packages],
  );

  const monthlyPrice = monthlyPkg?.product.priceString || FALLBACK_MONTHLY;
  const yearlyPrice = yearlyPkg?.product.priceString || FALLBACK_YEARLY;

  const selectedPkg = selectedPlan === "yearly" ? yearlyPkg : monthlyPkg;

  const syncWithServer = async (): Promise<boolean> => {
    if (!familyId) return false;
    const res = await apiRequest("POST", "/api/purchases/sync", { familyId });
    const data = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/purchases/status", familyId] });
    return data?.premium === true;
  };

  const runPurchase = async (pkg: PurchasesPackage) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await purchase(pkg);
      const premium = await syncWithServer();
      Alert.alert(premium ? "Premium attivato!" : "Acquisto registrato", premium ? "Grazie! Ora hai accesso a tutte le funzionalità Premium." : "Lo stato sarà aggiornato a breve.");
    } catch (error: any) {
      if (error?.userCancelled) return;
      Alert.alert("Acquisto non riuscito", error?.message ?? "Non è stato possibile completare l'acquisto. Riprova più tardi.");
    }
  };

  const handlePurchase = async () => {
    if (!familyId) return;
    if (!canPurchase) {
      Alert.alert("Permesso necessario", "Solo il proprietario o un amministratore della famiglia può acquistare Premium.");
      return;
    }
    if (!selectedPkg) {
      Alert.alert("Abbonamento non disponibile", "I piani Premium non sono al momento disponibili. Riprova più tardi.");
      return;
    }
    // In modalità test mostriamo una conferma personalizzata (no acquisto reale).
    if (isRevenueCatTestMode()) {
      setConfirmPkg(selectedPkg);
      return;
    }
    await runPurchase(selectedPkg);
  };

  const handleRestore = async () => {
    if (!familyId) return;
    try {
      await restore();
      const premium = await syncWithServer();
      Alert.alert(premium ? "Premium ripristinato!" : "Nessun abbonamento attivo", premium ? "Il tuo abbonamento è di nuovo attivo." : "Non abbiamo trovato acquisti da ripristinare.");
    } catch (error: any) {
      Alert.alert("Ripristino non riuscito", error?.message ?? "Non è stato possibile ripristinare gli acquisti. Riprova più tardi.");
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Premium</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 40 }}>
        <View style={styles.heroSection}>
          <View style={[styles.premiumBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="diamond" size={32} color="#000" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {isPremium ? "Sei Premium!" : "FamilySync Premium"}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {isPremium
              ? expiresAt
                ? `Attivo fino al ${new Date(expiresAt).toLocaleDateString("it-IT")}`
                : "Hai accesso a tutte le funzionalità Premium"
              : "Più AI per la tua famiglia. Acquisto sicuro tramite lo store."}
          </Text>
        </View>

        <View style={styles.comparison_wrap}>
          <View style={[styles.comparison, { borderColor: colors.border }]}>
            {PLAN_FEATURES.map((f, i) => (
              <View
                key={f.label}
                style={[
                  styles.compareRow,
                  { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={[styles.compareLabel, { color: colors.text }]}>{f.label}</Text>
                <View style={styles.compareValues}>
                  <Text style={[styles.compareFree, { color: colors.textSecondary }]}>{f.free}</Text>
                  <Text style={[styles.comparePremium, { color: colors.primary }]}>{f.premium}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {!isPremium && (
          <>
            <View style={styles.plansRow}>
              <Pressable
                onPress={() => setSelectedPlan("monthly")}
                style={[
                  styles.planColumn,
                  {
                    borderColor: selectedPlan === "monthly" ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderWidth: selectedPlan === "monthly" ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.planColTitle, { color: colors.text }]}>Mensile</Text>
                <Text style={[styles.planColPrice, { color: colors.primary }]}>{monthlyPrice}</Text>
                <Text style={[styles.planColPeriod, { color: colors.textSecondary }]}>al mese</Text>
              </Pressable>

              <Pressable
                onPress={() => setSelectedPlan("yearly")}
                style={[
                  styles.planColumn,
                  {
                    borderColor: selectedPlan === "yearly" ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderWidth: selectedPlan === "yearly" ? 2 : 1,
                  },
                ]}
              >
                <View style={[styles.bestBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.bestBadgeText}>Risparmia</Text>
                </View>
                <Text style={[styles.planColTitle, { color: colors.text }]}>Annuale</Text>
                <Text style={[styles.planColPrice, { color: colors.primary }]}>{yearlyPrice}</Text>
                <Text style={[styles.planColPeriod, { color: colors.textSecondary }]}>all'anno</Text>
              </Pressable>
            </View>

            {!canPurchase && (
              <Text style={[styles.roleNote, { color: colors.textSecondary }]}>
                Solo il proprietario o un amministratore della famiglia può acquistare Premium.
              </Text>
            )}

            <Pressable
              onPress={handlePurchase}
              disabled={working || !canPurchase}
              style={({ pressed }) => [
                styles.subscribeButton,
                { backgroundColor: colors.primary, opacity: (working || !canPurchase) ? 0.6 : (pressed ? 0.85 : 1) },
              ]}
            >
              {working ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.subscribeButtonText}>Passa a Premium</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable onPress={handleRestore} disabled={working} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.primary }]}>Ripristina acquisti</Text>
        </Pressable>

        <Text style={[styles.legalNote, { color: colors.textSecondary }]}>
          L'abbonamento si rinnova automaticamente tramite il tuo account App Store / Google Play
          e può essere gestito o annullato nelle impostazioni dello store.
        </Text>
      </ScrollView>

      <Modal visible={confirmPkg !== null} transparent animationType="fade" onRequestClose={() => setConfirmPkg(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Conferma acquisto (test)</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Modalità test RevenueCat: nessun pagamento reale verrà effettuato. Vuoi simulare l'acquisto di
              {" "}
              {confirmPkg?.product.priceString
                ? `${confirmPkg.product.priceString}`
                : selectedPlan === "yearly" ? yearlyPrice : monthlyPrice}?
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setConfirmPkg(null)} style={[styles.modalBtn, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Annulla</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const pkg = confirmPkg;
                  setConfirmPkg(null);
                  if (pkg) runPurchase(pkg);
                }}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.modalBtnText, { color: "#FFFFFF" }]}>Conferma</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 16,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 40 },
  content: { flex: 1, paddingHorizontal: 20 },
  heroSection: { alignItems: "center", marginBottom: 24 },
  premiumBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  heroSubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  comparison_wrap: { marginBottom: 24 },
  plansRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  planColumn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  bestBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 4 },
  bestBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  planColTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  planColPrice: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 4 },
  planColPeriod: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  comparison: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  compareRow: { paddingVertical: 12 },
  compareLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 6 },
  compareValues: { flexDirection: "row", justifyContent: "space-between" },
  compareFree: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  comparePremium: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
  roleNote: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 12, lineHeight: 18 },
  subscribeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  subscribeButtonText: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  restoreButton: { paddingVertical: 12, alignItems: "center", marginBottom: 16 },
  restoreText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  legalNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 360, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
