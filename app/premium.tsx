import { useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, ActivityIndicator, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { useFamily } from "@/context/FamilyContext";
import { apiRequest } from "@/lib/query-client";

const FEATURES = [
  { icon: "sparkles" as const, title: "Suggerimenti AI", description: "Ottieni suggerimenti intelligenti per spesa e faccende" },
  { icon: "people" as const, title: "Membri Illimitati", description: "Aggiungi tutti i membri della famiglia" },
  { icon: "sync" as const, title: "Sincronizzazione Real-time", description: "Aggiornamenti istantanei tra tutti i dispositivi" },
  { icon: "analytics" as const, title: "Statistiche Avanzate", description: "Analisi dettagliate dell'attivita familiare" },
  { icon: "color-palette" as const, title: "Temi Personalizzati", description: "Personalizza l'aspetto della tua app" },
  { icon: "shield-checkmark" as const, title: "Supporto Prioritario", description: "Assistenza dedicata e veloce" },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentFamily } = useFamily();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [notifySet, setNotifySet] = useState(false);

  const statusQuery = useQuery<any>({
    queryKey: ["/api/payments", "status"],
  });

  const paymentsEnabled = statusQuery.data?.paymentsEnabled === true;

  const productsQuery = useQuery<any>({
    queryKey: ["/api/payments", "products-with-prices"],
    enabled: paymentsEnabled,
  });

  const subscriptionQuery = useQuery<any>({
    queryKey: ["/api/payments/subscription", currentFamily?.id],
    enabled: paymentsEnabled && !!currentFamily?.id,
  });

  const products = productsQuery.data?.data || [];
  const subscription = subscriptionQuery.data;
  const familyPremium = ["premium", "active", "trialing"].includes(currentFamily?.subscriptionStatus ?? "");
  const isSubscribed = subscription?.status === "premium" || familyPremium;

  const getPrice = (type: "monthly" | "yearly") => {
    for (const product of products) {
      for (const price of product.prices || []) {
        if (type === "monthly" && price.recurring?.interval === "month") return price;
        if (type === "yearly" && price.recurring?.interval === "year") return price;
      }
    }
    return null;
  };

  const monthlyPrice = getPrice("monthly");
  const yearlyPrice = getPrice("yearly");

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency || "eur",
    }).format(amount / 100);
  };

  const handleSubscribe = async () => {
    if (!currentFamily) return;
    const price = selectedPlan === "monthly" ? monthlyPrice : yearlyPrice;
    if (!price) return;

    setLoading(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await apiRequest("POST", "/api/payments/checkout", {
        plan: selectedPlan,
        familyId: currentFamily.id,
      });
      const { url } = await res.json();
      if (url) Linking.openURL(url);
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!currentFamily) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/payments/portal", {
        familyId: currentFamily.id,
      });
      const { url } = await res.json();
      if (url) Linking.openURL(url);
    } catch (error) {
      console.error("Portal error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotifyMe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNotifySet(true);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const staticFeatures = statusQuery.data?.features || FEATURES.map(f => f.title);
  const staticPlans = statusQuery.data?.plans || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Premium</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.heroSection}>
          <View style={[styles.premiumBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="diamond" size={32} color="#000" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {isSubscribed ? "Sei Premium!" : "FamilySync Premium"}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {isSubscribed
              ? "Hai accesso a tutte le funzionalita Premium"
              : !paymentsEnabled
              ? "Presto disponibile! Ecco cosa avrai"
              : "Sblocca tutte le funzionalita per la tua famiglia"}
          </Text>
        </View>

        <View style={styles.featuresSection}>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name={feature.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {!paymentsEnabled && !isSubscribed && (
          <View style={styles.comingSoonSection}>
            {staticPlans.length > 0 && (
              <View style={[styles.previewPlans, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {staticPlans.map((plan: any, i: number) => (
                  <View key={i} style={styles.previewPlanRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.previewPlanName, { color: colors.text }]}>{plan.name}</Text>
                      <Text style={[styles.previewPlanPrice, { color: colors.primary }]}>{plan.price}</Text>
                    </View>
                    {plan.badge && (
                      <View style={[styles.previewBadge, { backgroundColor: colors.success }]}>
                        <Text style={styles.previewBadgeText}>{plan.badge}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={handleNotifyMe}
              disabled={notifySet}
              style={({ pressed }) => [
                styles.notifyButton,
                {
                  backgroundColor: notifySet ? colors.surface : colors.primary,
                  borderColor: notifySet ? colors.border : colors.primary,
                  borderWidth: notifySet ? 1 : 0,
                  opacity: pressed && !notifySet ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons
                name={notifySet ? "checkmark-circle" : "notifications"}
                size={20}
                color={notifySet ? colors.success : "#FFFFFF"}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.notifyButtonText, { color: notifySet ? colors.text : "#FFFFFF" }]}>
                {notifySet ? "Ti avviseremo!" : "Avvisami quando disponibile"}
              </Text>
            </Pressable>
          </View>
        )}

        {paymentsEnabled && !isSubscribed && (
          <>
            <View style={styles.plansSection}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlan("yearly");
                }}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: selectedPlan === "yearly" ? colors.primary : colors.border,
                    borderWidth: selectedPlan === "yearly" ? 2 : 1,
                  },
                ]}
              >
                <View style={[styles.saveBadge, { backgroundColor: colors.success }]}>
                  <Text style={styles.saveBadgeText}>Risparmia 33%</Text>
                </View>
                <Text style={[styles.planName, { color: colors.text }]}>Annuale</Text>
                <Text style={[styles.planPrice, { color: colors.primary }]}>
                  {yearlyPrice ? formatPrice(yearlyPrice.unit_amount, yearlyPrice.currency) : "39,99 EUR"}/anno
                </Text>
                <Text style={[styles.planMonthly, { color: colors.textSecondary }]}>
                  {yearlyPrice ? formatPrice(Math.round(yearlyPrice.unit_amount / 12), yearlyPrice.currency) : "~3,33 EUR"}/mese
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlan("monthly");
                }}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: selectedPlan === "monthly" ? colors.primary : colors.border,
                    borderWidth: selectedPlan === "monthly" ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.planName, { color: colors.text }]}>Mensile</Text>
                <Text style={[styles.planPrice, { color: colors.primary }]}>
                  {monthlyPrice ? formatPrice(monthlyPrice.unit_amount, monthlyPrice.currency) : "4,99 EUR"}/mese
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleSubscribe}
              disabled={loading}
              style={({ pressed }) => [
                styles.subscribeButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.subscribeButtonText}>Abbonati Ora</Text>
              )}
            </Pressable>
          </>
        )}

        {paymentsEnabled && isSubscribed && (
          <Pressable
            onPress={handleManageSubscription}
            disabled={loading}
            style={({ pressed }) => [
              styles.manageButton,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.manageButtonText, { color: colors.primary }]}>Gestisci Abbonamento</Text>
            )}
          </Pressable>
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
    paddingBottom: 16,
  },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  placeholder: { width: 40 },
  content: { flex: 1, paddingHorizontal: 20 },
  heroSection: { alignItems: "center", marginBottom: 32 },
  premiumBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  heroSubtitle: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  featuresSection: { gap: 16, marginBottom: 32 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  featureDescription: { fontSize: 13, fontFamily: "Inter_400Regular" },
  comingSoonSection: { marginBottom: 24, gap: 16 },
  previewPlans: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  previewPlanRow: { flexDirection: "row", alignItems: "center" },
  previewPlanName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  previewPlanPrice: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 2 },
  previewBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  previewBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  notifyButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  notifyButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  plansSection: { flexDirection: "row", gap: 12, marginBottom: 24 },
  planCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  saveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  planName: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  planPrice: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  planMonthly: { fontSize: 13, fontFamily: "Inter_400Regular" },
  subscribeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  subscribeButtonText: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  manageButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    marginTop: 16,
  },
  manageButtonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
