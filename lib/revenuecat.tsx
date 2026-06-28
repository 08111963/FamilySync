import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFamily } from "@/context/FamilyContext";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// lookup_key dell'entitlement Premium configurato in RevenueCat (seed script).
export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "premium";

/**
 * RevenueCat è il motore degli acquisti store-native. Il client gestisce SOLO
 * l'acquisto e mostra i prezzi dall'offering; lo stato Premium autorevole è
 * sincronizzato dal backend (POST /api/purchases/sync) e letto da /status.
 */

/** True quando siamo in modalità test RevenueCat (no acquisto reale store). */
export function isRevenueCatTestMode(): boolean {
  return (
    __DEV__ ||
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  );
}

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat Public API Keys non trovate");
  }

  if (isRevenueCatTestMode()) {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === "ios") {
    return REVENUECAT_IOS_API_KEY;
  }
  if (Platform.OS === "android") {
    return REVENUECAT_ANDROID_API_KEY;
  }
  return REVENUECAT_TEST_API_KEY;
}

let configured = false;

export function initializeRevenueCat(): void {
  if (configured) return;
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;
  console.log("Configured RevenueCat");
}

/**
 * Associa l'utente RevenueCat (AppUserID) alla famiglia corrente. AppUserID =
 * familyId: gli acquisti sono per-famiglia. Va chiamato al cambio famiglia.
 */
export async function loginRevenueCat(familyId: string): Promise<void> {
  if (!configured) {
    try {
      initializeRevenueCat();
    } catch {
      return;
    }
  }
  await Purchases.logIn(familyId);
}

function useSubscriptionContext() {
  const qc = useQueryClient();
  const { currentFamily } = useFamily();
  const familyId = currentFamily?.id;

  const customerInfoQuery = useQuery<CustomerInfo>({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery<PurchasesOfferings>({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => Purchases.getOfferings(),
    staleTime: 300 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => Purchases.restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  // Fonte di verità UNICA: backend /api/purchases/status (derivato da
  // entitlements), NON lo stato client RevenueCat. Così il Premium server-side
  // (inclusi gli owner_grant senza acquisto store) è riflesso ovunque
  // (bollette, notifiche, dettaglio bolletta, ecc.).
  const statusQuery = useQuery<{ premium?: boolean }>({
    queryKey: ["/api/purchases/status", familyId],
    enabled: !!familyId,
  });
  const isSubscribed = statusQuery.data?.premium === true;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading || statusQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    refetch: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
      if (familyId) {
        qc.invalidateQueries({ queryKey: ["/api/purchases/status", familyId] });
      }
    },
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
