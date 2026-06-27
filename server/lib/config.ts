export const config = {
  premiumPaymentsEnabled: process.env.PREMIUM_PAYMENTS_ENABLED === "true",

  // Regola gating AI:
  // - false (default, pagamenti disattivi): l'AI è gratuita per tutti gli utenti
  //   che hanno dato il consenso (toggle GDPR), limitata dalla quota giornaliera.
  // - true (quando i pagamenti Premium saranno attivi): l'AI richiede ANCHE che
  //   la famiglia abbia subscriptionStatus = "premium".
  // Vedi server/middleware/ai-guard.ts (requireAiEnabled).
  aiRequiresPremium: process.env.AI_REQUIRES_PREMIUM === "true",

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
