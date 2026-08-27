import { Slot } from "expo-router";
import React, { useEffect } from "react";
import { Alert } from "react-native";
import { FamilyProvider } from "@/context/FamilyContext";
import { BillNotificationsSyncProvider } from "@/context/BillNotificationsProvider";
import { SubscriptionProvider, initializeRevenueCat } from "@/lib/revenuecat";

export default function AppLayout() {
  useEffect(() => {
    try {
      initializeRevenueCat();
    } catch (err: any) {
      Alert.alert("RevenueCat non disponibile", err?.message ?? "Errore sconosciuto");
    }
  }, []);

  return (
    <FamilyProvider>
      <SubscriptionProvider>
        <BillNotificationsSyncProvider>
          <Slot />
        </BillNotificationsSyncProvider>
      </SubscriptionProvider>
    </FamilyProvider>
  );
}
