import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";
import { getStorePlatform, isIapAvailable, purchasePremium, restorePurchases, IapError } from "@/lib/iap";

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

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);

  const familyId = currentFamily?.id;

  const configQuery = useQuery<any>({
    queryKey: ["/api/purchases/config"],
  });

  const statusQuery = useQuery<any>({
    queryKey: ["/api/purchases/status", familyId],
    enabled: !!familyId,
  });

  // Fonte di verità UNICA: /api/purchases/status (derivato da entitlements).
  // Nessun fallback su currentFamily.subscriptionStatus.
  const isPremium = statusQuery.data?.premium === true;
  const expiresAt = statusQuery.data?.expiresAt as string | null | undefined;

  const storePlatform = getStorePlatform();
  const productId = storePlatform === "apple"
    ? configQuery.data?.iosProductId
    : configQuery.data?.androidProductId;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/purchases/status", familyId] });
  };

  const handlePurchase = async () => {
    if (!familyId) return;
    if (!storePlatform || !isIapAvailable()) {
      Alert.alert(
        "Acquisto non disponibile",
        "Gli acquisti in-app sono disponibili solo nell'app pubblicata su App Store / Google Play.",
      );
      return;
    }
    if (!productId) {
      Alert.alert("Configurazione mancante", "Prodotto Premium non configurato. Riprova più tardi.");
      return;
    }
    setWorking(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const purchase = await purchasePremium(productId);
      const res = await apiRequest("POST", "/api/purchases/verify", {
        familyId,
        platform: purchase.platform,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        receiptData: purchase.receiptData,
        transactionId: purchase.transactionId,
      });
      const data = await res.json();
      refresh();
      Alert.alert(data?.premium ? "Premium attivato!" : "Acquisto registrato", "");
    } catch (error) {
      if (error instanceof IapError) {
        if (error.code !== "IAP_CANCELLED") Alert.alert("Acquisto non riuscito", error.message);
      } else {
        Alert.alert("Errore", "Non è stato possibile completare l'acquisto. Riprova più tardi.");
      }
    } finally {
      setWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!familyId) return;
    if (!storePlatform || !isIapAvailable()) {
      Alert.alert(
        "Ripristino non disponibile",
        "Il ripristino acquisti è disponibile solo nell'app pubblicata su App Store / Google Play.",
      );
      return;
    }
    setWorking(true);
    try {
      const purchases = await restorePurchases();
      if (purchases.length === 0) {
        Alert.alert("Nessun acquisto", "Non abbiamo trovato acquisti da ripristinare.");
        return;
      }
      const p = purchases[0];
      const res = await apiRequest("POST", "/api/purchases/restore", {
        familyId,
        platform: p.platform,
        productId: p.productId,
        purchaseToken: p.purchaseToken,
        receiptData: p.receiptData,
        transactionId: p.transactionId,
      });
      const data = await res.json();
      refresh();
      Alert.alert(data?.premium ? "Premium ripristinato!" : "Nessun abbonamento attivo", "");
    } catch (error) {
      if (error instanceof IapError) {
        Alert.alert("Ripristino non riuscito", error.message);
      } else {
        Alert.alert("Errore", "Non è stato possibile ripristinare gli acquisti. Riprova più tardi.");
      }
    } finally {
      setWorking(false);
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

        <View style={styles.plansRow}>
          <View style={[styles.planColumn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.planColTitle, { color: colors.text }]}>Free</Text>
            <Text style={[styles.planColPrice, { color: colors.textSecondary }]}>Gratis</Text>
          </View>
          <View style={[styles.planColumn, { borderColor: colors.primary, backgroundColor: colors.surface, borderWidth: 2 }]}>
            <View style={[styles.bestBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.bestBadgeText}>Consigliato</Text>
            </View>
            <Text style={[styles.planColTitle, { color: colors.text }]}>Premium</Text>
            <Text style={[styles.planColPrice, { color: colors.primary }]}>AI completa</Text>
          </View>
        </View>

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

        {!isPremium && (
          <Pressable
            onPress={handlePurchase}
            disabled={working}
            style={({ pressed }) => [
              styles.subscribeButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {working ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name={storePlatform === "apple" ? "logo-apple" : "logo-google-playstore"}
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.subscribeButtonText}>Passa a Premium</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable onPress={handleRestore} disabled={working} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.primary }]}>Ripristina acquisti</Text>
        </Pressable>

        <Text style={[styles.legalNote, { color: colors.textSecondary }]}>
          L'abbonamento si rinnova automaticamente tramite il tuo account App Store / Google Play
          e può essere gestito o annullato nelle impostazioni dello store.
        </Text>
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
  plansRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
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
  planColPrice: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  comparison: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 24,
  },
  compareRow: { paddingVertical: 12 },
  compareLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 6 },
  compareValues: { flexDirection: "row", justifyContent: "space-between" },
  compareFree: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  comparePremium: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
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
});
