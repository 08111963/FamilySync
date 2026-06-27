export const config = {
  premiumPaymentsEnabled: process.env.PREMIUM_PAYMENTS_ENABLED === "true",

  // Regola gating AI:
  // - false (default, pagamenti disattivi): l'AI è gratuita per tutti gli utenti
  //   che hanno dato il consenso (toggle GDPR), limitata dalla quota giornaliera.
  // - true (quando i pagamenti Premium saranno attivi): l'AI richiede ANCHE che
  //   la famiglia abbia subscriptionStatus = "premium".
  // Vedi server/middleware/ai-guard.ts (requireAiEnabled).
  aiRequiresPremium: process.env.AI_REQUIRES_PREMIUM === "true",

  // Acquisti in-app store-native (Premium mobile). I productId sono configurabili
  // via env per allinearli a quanto creato in Google Play Console / App Store
  // Connect. Le credenziali di verifica server-side sono opzionali in sviluppo:
  // se mancanti, gli endpoint di verifica rispondono 503 (configurabile/futuro).
  iap: {
    androidProductId: process.env.ANDROID_PREMIUM_PRODUCT_ID || "familysync_premium",
    iosProductId: process.env.IOS_PREMIUM_PRODUCT_ID || "familysync_premium",
    androidPackageName: process.env.ANDROID_PACKAGE_NAME || "",
    // JSON del service account Google Play Developer API (per verificare i token).
    googleServiceAccountJson: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "",
    // Shared secret App Store (per verifyReceipt degli abbonamenti Apple).
    appleSharedSecret: process.env.APPLE_SHARED_SECRET || "",
  },

  /** Verifica server-side configurata per la piattaforma indicata? */
  isIapVerificationConfigured(platform: "google" | "apple"): boolean {
    if (platform === "google") {
      return config.iap.googleServiceAccountJson.trim().length > 0 && config.iap.androidPackageName.trim().length > 0;
    }
    return config.iap.appleSharedSecret.trim().length > 0;
  },

  /** productId Premium per la piattaforma del client. */
  premiumProductIdFor(platform: "google" | "apple" | string): string {
    return platform === "apple" ? config.iap.iosProductId : config.iap.androidProductId;
  },

  port: parseInt(process.env.PORT || "5000", 10),

  getBaseUrl(req?: { header: (name: string) => string | undefined; protocol: string; get: (name: string) => string | undefined }): string {
    if (req) {
      const proto = req.header("x-forwarded-proto") || req.protocol || "https";
      const host = req.header("x-forwarded-host") || req.get("host");
      if (host) return `${proto}://${host}`;
    }

    if (process.env.REPLIT_DOMAINS) {
      const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
      return `https://${domain}`;
    }

    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }

    return `http://localhost:${config.port}`;
  },
};
