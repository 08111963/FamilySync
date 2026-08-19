// PRIMA di ogni altro import: polyfill per WebView Android datati (browser
// in-app WhatsApp/Gmail) — vedi lib/runtime-polyfills.ts.
import "@/lib/runtime-polyfills";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Alert, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FamilyProvider } from "@/context/FamilyContext";
import { BillNotificationsSyncProvider } from "@/context/BillNotificationsProvider";
import { SubscriptionProvider, initializeRevenueCat } from "@/lib/revenuecat";
import { trackEvent, trackScreenView } from "@/lib/test-analytics";
import {
  getNotificationsModule,
  isPushSupported,
  registerForPushNotifications,
} from "@/lib/push-notifications";

// Registra il token push quando l'utente è autenticato e gestisce il tap
// sulla notifica navigando alla schermata indicata in data.route.
import { WebUpdateBanner } from "@/components/WebUpdateBanner";
import { PolicyUpdateBanner } from "@/components/PolicyUpdateBanner";
function PushNotificationsManager() {
  const { isAuthenticated, accessToken, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && accessToken && user?.id) {
      registerForPushNotifications(accessToken, user.id);
    }
  }, [isAuthenticated, accessToken, user?.id]);

  useEffect(() => {
    if (!isPushSupported()) return;
    let active = true;
    let sub: { remove: () => void } | undefined;
    void getNotificationsModule().then((notifications) => {
      if (!active || !notifications) return;
      sub = notifications.addNotificationResponseReceivedListener((response) => {
        const route = response.notification.request.content.data?.route;
        if (typeof route === "string" && route.startsWith("/")) {
          router.push(route as any);
        }
      });
    });
    return () => {
      active = false;
      sub?.remove();
    };
  }, [router]);

  return null;
}

// Analytics interna TEMPORANEA (periodo di test): traccia apertura app e cambio
// schermata SOLO per utenti autenticati. Fire-and-forget, mai bloccante.
function TestAnalyticsTracker() {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const appOpenSent = React.useRef(false);

  useEffect(() => {
    if (isAuthenticated && !appOpenSent.current) {
      appOpenSent.current = true;
      trackEvent("app_open");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && pathname) {
      trackScreenView(pathname);
    }
  }, [isAuthenticated, pathname]);

  return null;
}

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  // NB: nel layout radice serve useGlobalSearchParams: useLocalSearchParams
  // non vede i parametri della schermata attiva (returnTo arriverebbe vuoto).
  const params = useGlobalSearchParams<{ returnTo?: string }>();

  useEffect(() => {
    if (isLoading) return;

    const root = segments[0];
    // Se l'utente stava aprendo un link d'invito ma deve prima verificare
    // l'email o completare l'onboarding, ricordiamo la destinazione (returnTo)
    // per riportarlo all'invito alla fine, invece di lasciarlo sulla home
    // "Crea la tua famiglia". Accettiamo SOLO percorsi interni /join*.
    const rawReturnTo = typeof params.returnTo === "string" ? params.returnTo : undefined;
    const safeReturnTo = rawReturnTo && /^\/join(-link)?\/[A-Za-z0-9_-]+$/.test(rawReturnTo) ? rawReturnTo : undefined;
    const inviteReturnTo = (root === "join" || root === "join-link") && pathname ? pathname : safeReturnTo;
    const withReturnTo = (base: string) => (inviteReturnTo ? `${base}?returnTo=${encodeURIComponent(inviteReturnTo)}` : base);
    // "social-complete" è pubblica: il nuovo utente Google/Apple arriva qui
    // NON ancora autenticato (ha solo il signupToken) per completare la
    // registrazione; senza questa eccezione verrebbe rimbalzato su /welcome.
    const inPublicGroup = root === "login" || root === "welcome" || root === "join" || root === "join-link" || root === "legal" || root === "help" || root === "forgot-password" || root === "reset-password" || root === "social-complete" || root === "child-login";
    const needsVerification = isAuthenticated && !!user && user.emailVerified === false;
    const inVerifyScreen = root === "verify-email";
    // Onboarding privacy: utenti esistenti senza fascia d'età / accettazione Termini.
    const needsOnboarding = isAuthenticated && !!user && user.needsOnboarding === true;
    const inOnboardingScreen = root === "onboarding";
    const onboardingAllowed = inOnboardingScreen || root === "legal" || root === "help" || root === "delete-account";
    // L'eliminazione account e un diritto fondamentale: deve restare accessibile
    // anche a utenti autenticati con email non ancora verificata.
    // Le pagine invito restano accessibili anche con email non verificata:
    // mostrano un avviso dedicato "Verifica prima la tua email" con link alla
    // verifica, più chiaro del redirect immediato alla schermata generica.
    const verificationAllowed = inVerifyScreen || root === "legal" || root === "help" || root === "delete-account" || root === "join" || root === "join-link";

    if (!isAuthenticated && !inPublicGroup && !inVerifyScreen) {
      router.replace("/welcome");
    } else if (needsVerification && !verificationAllowed) {
      router.replace(withReturnTo("/verify-email") as any);
    } else if (needsOnboarding && !needsVerification && !onboardingAllowed) {
      // NB: la guardia !needsVerification è essenziale. Un account con email
      // NON verificata E onboarding incompleto altrimenti rimbalzerebbe
      // all'infinito tra /verify-email e /onboarding (React #185): prima
      // si verifica l'email, poi si completa l'onboarding.
      router.replace(withReturnTo("/onboarding") as any);
    } else if (isAuthenticated && !needsVerification && !needsOnboarding && (inVerifyScreen || inOnboardingScreen || (inPublicGroup && root !== "join" && root !== "join-link" && root !== "legal" && root !== "help" && root !== "forgot-password" && root !== "reset-password"))) {
      // Se c'era un invito in sospeso, torna lì invece che alla home.
      router.replace((safeReturnTo || "/") as any);
    }
  }, [isAuthenticated, isLoading, user, segments, pathname, params.returnTo]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="child-login" options={{ headerShown: false }} />
      <Stack.Screen name="social-complete" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="verify-email/index" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="verify-email/[token]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-member" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="promote-member" options={{ presentation: "modal", headerShown: false }} />
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
      <Stack.Screen name="rewards" options={{ headerShown: false }} />
      <Stack.Screen name="pantry" options={{ headerShown: false }} />
      <Stack.Screen name="budget" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/add" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="meal-plans/index" options={{ headerShown: false }} />
      <Stack.Screen name="meal-plans/edit" options={{ headerShown: false }} />
      <Stack.Screen name="join/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="join-link/[code]" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="legal/minors" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-center" options={{ headerShown: false }} />
      <Stack.Screen name="help/user-guide" options={{ headerShown: false }} />
      <Stack.Screen name="admin/test-analytics" options={{ headerShown: false }} />
    </Stack>
    </View>
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
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <AuthGate>
                      <TestAnalyticsTracker />
                      <PushNotificationsManager />
                      <RootLayoutNav />
                      <PolicyUpdateBanner />
                      {Platform.OS === "web" && <WebUpdateBanner />}
                    </AuthGate>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </BillNotificationsSyncProvider>
            </SubscriptionProvider>
          </FamilyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
