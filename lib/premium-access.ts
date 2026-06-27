/**
 * Logica di presentazione della schermata Premium.
 *
 * Decisione strategica (pubblicazione su App Store / Google Play): nell'app
 * mobile NON si vende il Premium tramite Stripe. Quando i pagamenti sono
 * disattivati (paymentsEnabled = false, stato di default) la schermata non
 * deve mostrare alcun pulsante di acquisto né rimandare a pagamenti esterni.
 *
 * Lo Stripe backend resta nel codice ma disattivato/configurabile per
 * web/test/futuro. Una eventuale vendita in-app dovrà usare Apple In-App
 * Purchase e Google Play Billing, non Stripe.
 */
export type PremiumViewState = {
  /** Mostra le card piani + pulsante "Abbonati Ora" (checkout Stripe). */
  showPurchaseCTA: boolean;
  /** Mostra il pulsante "Gestisci Abbonamento" (portal Stripe). */
  showManageCTA: boolean;
  /** Mostra la sezione "Presto disponibile" (nessun acquisto, nessun prezzo). */
  showComingSoon: boolean;
};

export function getPremiumViewState(opts: {
  paymentsEnabled: boolean;
  isSubscribed: boolean;
  /** Platform.OS ("ios" | "android" | "web"). */
  platform?: string;
}): PremiumViewState {
  const isNative = opts.platform === "ios" || opts.platform === "android";
  const isSubscribed = opts.isSubscribed === true;

  // Garanzia per le policy App Store / Google Play: sul mobile NON si vende
  // mai il Premium via Stripe, qualunque sia lo stato del backend. Anche se i
  // pagamenti vengono riattivati per il web (PREMIUM_PAYMENTS_ENABLED=true),
  // iOS/Android non mostrano CTA di acquisto né di gestione (link esterni).
  // Una futura vendita in-app dovrà usare Apple IAP / Google Play Billing.
  const paymentsEnabled = !isNative && opts.paymentsEnabled === true;

  return {
    showPurchaseCTA: paymentsEnabled && !isSubscribed,
    showManageCTA: paymentsEnabled && isSubscribed,
    showComingSoon: !paymentsEnabled && !isSubscribed,
  };
}
