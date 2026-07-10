import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Alert } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FamilyProvider } from "@/context/FamilyContext";
import { BillNotificationsSyncProvider } from "@/context/BillNotificationsProvider";
import { ChoreNotificationsSyncProvider } from "@/context/ChoreNotificationsProvider";
import { SubscriptionProvider, initializeRevenueCat } from "@/lib/revenuecat";

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const root = segments[0];
    const inPublicGroup = root === "login" || root === "welcome" || root === "join" || root === "join-link" || root === "legal" || root === "help" || root === "forgot-password" || root === "reset-password";
    const needsVerification = isAuthenticated && !!user && user.emailVerified === false;
    const inVerifyScreen = root === "verify-email";
    // L'eliminazione account e un diritto fondamentale: deve restare accessibile
    // anche a utenti autenticati con email non ancora verificata.
    const verificationAllowed = inVerifyScreen || root === "legal" || root === "help" || root === "delete-account";

    if (!isAuthenticated && !inPublicGroup && !inVerifyScreen) {
      router.replace("/welcome");
    } else if (needsVerification && !verificationAllowed) {
      router.replace("/verify-email");
    } else if (isAuthenticated && !needsVerification && (inVerifyScreen || (inPublicGroup && root !== "join" && root !== "join-link" && root !== "legal" && root !== "help" && root !== "forgot-password" && root !== "reset-password"))) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, user, segments]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-member" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="contact-support" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="change-password" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="delete-account" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="add-event" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="add-chore" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="add-bill" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="shopping-list" options={{ headerShown: false }} />
      <Stack.Screen name="premium" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="ai-insights" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="calendar-sync" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/index" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/add" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="meal-plans/index" options={{ headerShown: false }} />
      <Stack.Screen name="meal-plans/edit" options={{ headerShown: false }} />
      <Stack.Screen name="join/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="join-link/[code]" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="help/user-guide" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    try {
      initializeRevenueCat();
    } catch (err: any) {
      Alert.alert("RevenueCat non disponibile", err?.message ?? "Errore sconosciuto");
    }
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FamilyProvider>
            <SubscriptionProvider>
              <BillNotificationsSyncProvider>
                <ChoreNotificationsSyncProvider>
                  <GestureHandlerRootView>
                    <KeyboardProvider>
                      <AuthGate>
                        <RootLayoutNav />
                      </AuthGate>
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </ChoreNotificationsSyncProvider>
              </BillNotificationsSyncProvider>
            </SubscriptionProvider>
          </FamilyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
