---
name: Stripe payments conventions (FamilySync)
description: How Stripe checkout/subscription/webhook is wired in FamilySync — family-scoped, server-side price resolution, families-table reconciliation.
---

# Stripe payments conventions

Subscriptions are bound to the FAMILY, not the user. The app reads Premium state from the `families` table (`subscriptionStatus`), so webhooks must reconcile that table — syncing only the `stripe.*` tables is not enough.

**Rule: never trust a client-supplied `priceId`.**
- Client sends only `plan` (`monthly`|`yearly`) + `familyId` to `POST /api/payments/checkout`.
- Backend resolves & validates the priceId server-side from the active "FamilySync Premium" product (metadata.tier='premium', currency EUR, matching recurring interval) via `resolvePriceIdForPlan`/`getPriceIdForPlan`.
**Why:** a client-chosen priceId lets a user subscribe at an arbitrary/wrong price.

**Endpoints:** `GET /api/payments/subscription/:familyId` (requireFamilyMember — explicit familyId, no "first family of user"); checkout uses requireFamilyAdmin. Portal `return_url` → `/premium` (`/settings` does not exist).

**Status mapping (`mapStripeStatusToFamily`):** active/trialing/past_due → `premium`; everything else → `canceled`. Enum: `['free','premium','canceled']`.

**Webhook reconciliation (`reconcileFamilyFromEvent` in server/lib/webhookHandlers.ts):** handles `customer.subscription.*` → `updateFamilyFromStripeSubscription`, and `checkout.session.completed` → `updateFamilyStripeInfo(familyId, {premium,...})`. Takes an optional injectable `service` param (default real stripeService) purely so node:test can pass a fake capturing calls — no DI framework.

**Mobile NEVER sells Premium via Stripe (App Store / Play policy).** `getPremiumViewState` in `lib/premium-access.ts` takes a `platform` arg; on `ios`/`android` it forces `showPurchaseCTA`/`showManageCTA` to false REGARDLESS of backend `paymentsEnabled`, so re-enabling Stripe for web never resurfaces purchase CTAs / external `Linking.openURL` on native. `premium.tsx` passes `Platform.OS`.
**Why:** Apple/Google forbid steering users to external payment for digital goods unlocked in-app. Backend Stripe stays in code but inert: `requirePayments` returns 503 PAYMENTS_DISABLED when `config.premiumPaymentsEnabled` is false (default), and webhook/init are gated in server/index.ts. Future in-app sales must use Apple IAP / Google Play Billing, not Stripe.

**AI gating vs Premium:** controlled by `config.aiRequiresPremium` (default `false`). false = AI free with daily quota (does not break UX when payments disabled); true = requires premium family. Do NOT hard-disable AI when payments are off.

**Checkout metadata:** always set `client_reference_id`, `metadata.familyId/userId`, and `subscription_data.metadata` so webhooks can map back to the family.

**Tests:** `server/__tests__/payments.test.ts` (node:test, run via `npx tsx`). Pure helpers exported from stripeService.ts (validatePlan, PLAN_TO_INTERVAL, mapStripeStatusToFamily, extractFamilyRefFromSubscription, buildCheckoutSessionParams, resolvePriceIdForPlan, PaymentConfigError) are unit-tested without hitting Stripe/DB.
