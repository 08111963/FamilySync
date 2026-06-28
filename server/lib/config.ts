export const config = {
  premiumPaymentsEnabled: process.env.PREMIUM_PAYMENTS_ENABLED === "true",

  // Regola gating AI:
  // - false (default, pagamenti disattivi): l'AI è gratuita per tutti gli utenti
  //   che hanno dato il consenso (toggle GDPR), limitata dalla quota giornaliera.
  // - true (quando i pagamenti Premium saranno attivi): l'AI richiede ANCHE che
  //   la famiglia abbia subscriptionStatus = "premium".
  // Vedi server/middleware/ai-guard.ts (requireAiEnabled).
  aiRequiresPremium: process.env.AI_REQUIRES_PREMIUM === "true",

  // Email (separate da virgola) di account "proprietario" con Premium permanente.
  // Ogni famiglia di cui questi account fanno parte è sempre Premium, a
  // prescindere da acquisti/scadenze. Vuoto = nessun account privilegiato.
  premiumOwnerEmails: (process.env.PREMIUM_OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // RevenueCat è il motore degli acquisti store-native (Premium mobile). Il
  // backend sincronizza lo stato da RevenueCat (REST v2) verso la tabella
  // entitlements; isPremium(familyId) resta letto dal DB. AppUserID = familyId.
  revenuecat: {
    projectId: process.env.REVENUECAT_PROJECT_ID || "",
    // lookup_key dell'entitlement Premium (es. "premium").
    entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID || "premium",
    // id oggetto RevenueCat dell'entitlement (es. entl...), usato come ulteriore
    // confronto perché l'endpoint active_entitlements espone l'entitlement_id.
    entitlementRcId: process.env.REVENUECAT_ENTITLEMENT_RC_ID || "",
    // Valore atteso nell'header Authorization dei webhook RevenueCat. Se vuoto,
    // i webhook NON sono autenticati (accettabile solo in sviluppo).
    webhookAuthHeader: process.env.REVENUECAT_WEBHOOK_AUTH_HEADER || "",
  },

  port: parseInt(process.env.PORT || "5000", 10),

  // True quando il server gira in ambiente di produzione (deploy). Usato per
  // imporre requisiti più stringenti (es. invio email obbligatorio).
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  },

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
