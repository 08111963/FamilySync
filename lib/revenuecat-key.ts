/**
 * Selezione PURA della API key RevenueCat (nessuna dipendenza da react-native:
 * testabile con node:test). Regola del mandato monetizzazione:
 * - modalità test / Expo Go / web  -> serve SOLO la TEST key
 * - iOS reale                      -> serve SOLO la IOS key
 * - Android reale                  -> serve SOLO la ANDROID key
 * Una build Android non deve mai fallire perché manca la chiave iOS (e
 * viceversa). Fail-fast con messaggio chiaro se manca la chiave necessaria.
 */
export function selectRevenueCatApiKey(input: {
  testMode: boolean;
  platform: string;
  testKey?: string;
  iosKey?: string;
  androidKey?: string;
}): string {
  const { testMode, platform, testKey, iosKey, androidKey } = input;
  if (testMode || (platform !== "ios" && platform !== "android")) {
    if (!testKey) throw new Error("RevenueCat: manca EXPO_PUBLIC_REVENUECAT_TEST_API_KEY (modalità test/web)");
    return testKey;
  }
  if (platform === "ios") {
    if (!iosKey) throw new Error("RevenueCat: manca EXPO_PUBLIC_REVENUECAT_IOS_API_KEY (build iOS)");
    return iosKey;
  }
  if (!androidKey) throw new Error("RevenueCat: manca EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (build Android)");
  return androidKey;
}
