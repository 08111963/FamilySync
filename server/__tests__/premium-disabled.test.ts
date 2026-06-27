import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getPremiumViewState } from "../../lib/premium-access";
import { config } from "../lib/config";
import { resolveMealPlanVariants, MEAL_PLAN_MAX_VARIANTS } from "../lib/ai-policy";

describe("getPremiumViewState (schermata Premium)", () => {
  test("pagamenti disattivi + non abbonato -> NESSUNA CTA di acquisto Stripe", () => {
    const s = getPremiumViewState({ paymentsEnabled: false, isSubscribed: false });
    assert.equal(s.showPurchaseCTA, false);
    assert.equal(s.showManageCTA, false);
    assert.equal(s.showComingSoon, true);
  });

  test("pagamenti disattivi anche se 'abbonato' -> nessun acquisto, nessun portale", () => {
    const s = getPremiumViewState({ paymentsEnabled: false, isSubscribed: true });
    assert.equal(s.showPurchaseCTA, false);
    assert.equal(s.showManageCTA, false);
    assert.equal(s.showComingSoon, false);
  });

  test("pagamenti attivi + non abbonato -> mostra acquisto (uso web/futuro)", () => {
    const s = getPremiumViewState({ paymentsEnabled: true, isSubscribed: false });
    assert.equal(s.showPurchaseCTA, true);
    assert.equal(s.showManageCTA, false);
  });

  test("pagamenti attivi + abbonato -> mostra gestione abbonamento", () => {
    const s = getPremiumViewState({ paymentsEnabled: true, isSubscribed: true });
    assert.equal(s.showManageCTA, true);
    assert.equal(s.showPurchaseCTA, false);
  });

  test("input non booleani sono trattati come false (fail-safe, niente acquisto)", () => {
    const s = getPremiumViewState({ paymentsEnabled: undefined as any, isSubscribed: undefined as any });
    assert.equal(s.showPurchaseCTA, false);
    assert.equal(s.showComingSoon, true);
  });

  test("MOBILE (iOS/Android): MAI acquisto Stripe anche se i pagamenti backend sono attivi", () => {
    for (const platform of ["ios", "android"]) {
      const s = getPremiumViewState({ paymentsEnabled: true, isSubscribed: false, platform });
      assert.equal(s.showPurchaseCTA, false, `${platform} non deve mostrare acquisto`);
      assert.equal(s.showComingSoon, true, `${platform} mostra 'presto disponibile'`);
    }
  });

  test("MOBILE: nessuna CTA di gestione (link esterno) anche se abbonato", () => {
    const s = getPremiumViewState({ paymentsEnabled: true, isSubscribed: true, platform: "ios" });
    assert.equal(s.showManageCTA, false);
    assert.equal(s.showPurchaseCTA, false);
  });

  test("WEB: con pagamenti attivi l'acquisto resta disponibile (uso futuro/test)", () => {
    const s = getPremiumViewState({ paymentsEnabled: true, isSubscribed: false, platform: "web" });
    assert.equal(s.showPurchaseCTA, true);
  });
});

describe("AI: modello quota gratuito (non venduto via Stripe)", () => {
  test("di default i pagamenti Premium sono disattivi", () => {
    assert.equal(config.premiumPaymentsEnabled, false);
  });

  test("di default l'AI NON richiede Premium: resta gratuita con quota", () => {
    assert.equal(config.aiRequiresPremium, false);
  });

  test("piano pasti: 1 sola variante (nessun upsell premium a maggior costo AI)", () => {
    assert.equal(MEAL_PLAN_MAX_VARIANTS, 1);
    assert.equal(resolveMealPlanVariants(5), 1);
    assert.equal(resolveMealPlanVariants(2), 1);
    assert.equal(resolveMealPlanVariants(1), 1);
    assert.equal(resolveMealPlanVariants(0), 1);
  });
});
