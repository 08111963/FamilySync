// PRIMA di ogni altro import: polyfill per WebView Android datati (browser
// in-app WhatsApp/Gmail) — vedi lib/runtime-polyfills.ts.
import "@/lib/runtime-polyfills";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { trackEvent, trackScreenView } from "@/lib/test-analytics";
import {
  getNotificationsModule,
  isPushSupported,
  registerForPushNotifications,
} from "@/lib/push-notifications";
import { firstStringParam, safeReturnTo } from "@/lib/safe-return-to";
import { WebUpdateBanner } from "@/components/WebUpdateBanner";
import { PolicyUpdateBanner } from "@/components/PolicyUpdateBanner";

SplashScreen.preventAutoHideAsync();

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

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    returnTo?: string | string[];
    familyId?: string | string[];
    date?: string | string[];
    choreId?: string | string[];
  }>();

  useEffect(() => {
    if (isLoading) return;

    const root = segments[0] as string | undefined;
    // I gruppi sono trasparenti nell'URL, ma presenti nei segmenti Expo.
    const inPublicGroup = root === "(public)";
    const inAppGroup = root === "(app)";
    const seg1 = segments[1] as string | undefined;
    const legacyPublic =
      root === "child-login" ||
      root === "social-complete" ||
      root === "join-link";
    const directInviteReturnTo =
      ((inPublicGroup && seg1 === "join") || root === "join-link") && pathname
        ? safeReturnTo(pathname)
        : undefined;
    const directChoreReturnTo =
      pathname === "/chores"
        ? safeReturnTo(
            `/chores?${new URLSearchParams({
              familyId: firstStringParam(params.familyId) || "",
              date: firstStringParam(params.date) || "",
              choreId: firstStringParam(params.choreId) || "",
            }).toString()}`,
          )
        : undefined;
    const pendingReturnTo =
      directInviteReturnTo ||
      directChoreReturnTo ||
      safeReturnTo(firstStringParam(params.returnTo));
    const withReturnTo = (base: string) =>
      pendingReturnTo
        ? `${base}?returnTo=${encodeURIComponent(pendingReturnTo)}`
        : base;
    const inPublicRoute = inPublicGroup || legacyPublic;

    const needsVerification = isAuthenticated && !!user && user.emailVerified === false;
    const inVerifyScreen =
      (inPublicGroup && seg1 === "verify-email") || root === "verify-email";
    const needsOnboarding = isAuthenticated && !!user && user.needsOnboarding === true;
    const inOnboardingScreen = root === "onboarding";

    const verificationAllowed =
      inVerifyScreen ||
      (inPublicGroup && (seg1 === "legal" || seg1 === "help")) ||
      (inAppGroup && seg1 === "delete-account") ||
      (inPublicGroup && seg1 === "join") ||
      root === "join-link";
    const onboardingAllowed =
      inOnboardingScreen ||
      (inPublicGroup && (seg1 === "legal" || seg1 === "help")) ||
      (inAppGroup && seg1 === "delete-account");

    const allowedPublicWhenAuthenticated =
      inPublicGroup &&
      (seg1 === "join" ||
        seg1 === "legal" ||
        seg1 === "help" ||
        seg1 === "forgot-password" ||
        seg1 === "reset-password" ||
         seg1 === "verify-email") ||
      root === "join-link";

    if (!isAuthenticated && !inPublicRoute && !inVerifyScreen) {
      router.replace(withReturnTo("/welcome") as any);
    } else if (needsVerification && !verificationAllowed) {
      router.replace(withReturnTo("/verify-email") as any);
    } else if (needsOnboarding && !needsVerification && !onboardingAllowed) {
      router.replace(withReturnTo("/onboarding") as any);
    } else if (
      isAuthenticated &&
      !needsVerification &&
      !needsOnboarding &&
      (inVerifyScreen ||
        inOnboardingScreen ||
        (inPublicRoute && !allowedPublicWhenAuthenticated))
    ) {
      router.replace((pendingReturnTo || "/") as any);
    }
  }, [
    isAuthenticated,
    isLoading,
    user,
    segments,
    pathname,
    params.returnTo,
    params.familyId,
    params.date,
    params.choreId,
    router,
  ]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(public)/welcome" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/verify-email" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(public)/forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/reset-password/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/join/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/legal/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/legal/minors" options={{ headerShown: false }} />
      <Stack.Screen name="(public)/help/user-guide" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/add-member" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/contact-support" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/change-password" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/delete-account" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/add-event" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/add-chore" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/add-bill" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/bill/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/shopping-list" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/premium" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/ai-insights" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/calendar-sync" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/recipes/index" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/recipes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/recipes/add" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/meal-plans/index" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/meal-plans/edit" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/meal-plans/view" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/report-content" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/report-user" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="(app)/blocked-users" options={{ headerShown: false }} />
      <Stack.Screen name="(app)/admin-reports" options={{ headerShown: false }} />
      <Stack.Screen name="child-login" options={{ headerShown: false }} />
      <Stack.Screen name="social-complete" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="verify-email/[token]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="join-link/[code]" options={{ headerShown: false }} />
      <Stack.Screen name="promote-member" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="rewards" options={{ headerShown: false }} />
      <Stack.Screen name="pantry" options={{ headerShown: false }} />
      <Stack.Screen name="budget" options={{ headerShown: false }} />
      <Stack.Screen name="feedback" options={{ headerShown: false }} />
      <Stack.Screen name="admin/feedback" options={{ headerShown: false }} />
      <Stack.Screen name="admin/test-analytics" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // On web, render immediately with system fonts so public routes are not
  // blocked by font downloads (avoids a render-blocking asset for crawlers).
  // On native, keep the splash screen until fonts are ready for a polished UX.
  if (!fontsLoaded && !fontError && Platform.OS !== "web") {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
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
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
