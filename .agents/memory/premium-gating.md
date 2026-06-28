---
name: Premium / freemium model (entitlements)
description: How Premium status, AI quotas, and store purchases work in FamilySync
---

# Premium = entitlements, single source of truth

- **`isPremium(familyId)` in `server/lib/entitlements.ts` is the ONLY source of truth.** It reads the `entitlements` table (one row per family, unique on familyId) and returns true only for status=active and not expired. **Fail-closed**: any error → false.
- **`families.subscriptionStatus` is a MIRROR, never a gate.** `applyPurchase` syncs it ("premium"/"free") for display only. Do NOT branch premium logic on it anywhere (backend or frontend). The old cosmetic-gating model that OR-ed `subscriptionStatus in premium|active|trialing` was removed.
- `app/premium.tsx` reads premium state ONLY from `GET /api/purchases/status/:familyId` (derived from entitlements) — no `currentFamily.subscriptionStatus` fallback.
- `server/middleware/ai-guard.ts`: when `config.aiRequiresPremium` is true it gates via `isPremium(familyId)`, not the families table. With the flag false (default), AI is open to any consenting user (GDPR `users.aiFeaturesEnabled`).

# Premium gating must cover READS, not just writes
- Detail/GET endpoints that bundle premium-only sub-resources (e.g. bills detail returning splits/attachments/history) must gate EACH premium sub-resource on `getPlanForFamily`/`isPremium`, returning `[]` for free families — not only the write endpoints.
- **Why:** a UI lock alone is bypassable via the raw API; if a GET returns premium data to free families the backend stops being the single source of truth. Mirror every write-gate with a read-gate.

# AI is freemium by QUOTA, not by paywall
- AI is never sold separately. The free/premium difference is ONLY the per-plan quota in `PLAN_LIMITS` (`server/lib/ai-usage.ts`), resolved server-side in `reserveAiSlot` via `getPlanForFamily`. Quotas have a `window` of `day|week`; the 429 message reflects which.
- **Why:** requirement was a real freemium model — AI stays demoable for free families but limited; premium unlocks higher quotas.
- **Family admins bypass AI quotas entirely.** `reserveAiSlot` checks the requester's `family_members.role`; if `admin`, it sets `effectiveMax = Number.MAX_SAFE_INTEGER` so they are never rate-limited (usage is still tracked in `ai_usage`). The admin lookup fails closed to non-admin on DB error.
- **Why:** explicit user requirement — the family admin/owner must never hit AI limits. Centralized in `reserveAiSlot` so every feature using `reserveAiSlot`/`withAiUsage` inherits it.

# Premium is store-native only (IAP), Stripe stays dormant
- Purchases are verified server-side by an injectable verifier (`server/lib/iap-verifier.ts`, `__setIapVerifierForTest`): real Apple verifyReceipt + Google Play subscriptions API. Real verification runs ONLY when store credentials are configured (`config.isIapVerificationConfigured`), else 503 `PURCHASE_VERIFICATION_UNAVAILABLE`.
- **Never trust client `productId`** in `/api/purchases/verify|restore` — the route forces `config.premiumProductIdFor(platform)` so a client can't validate a different SKU into a premium entitlement.
- **`lib/iap.ts` (client) is intentionally a STUB**: `isIapAvailable()` returns false; purchase/restore throw `IAP_NOT_AVAILABLE`. Real native IAP (StoreKit / Play Billing) needs a production native build + store credentials — not possible in Expo Go. The backend + verification are fully real and unit-tested with a fake verifier.
- Stripe remains dormant (`PREMIUM_PAYMENTS_ENABLED=false`) and must NOT unlock mobile premium. `premium-disabled.test.ts` guards the no-Stripe invariant.

# Owner premium permanente (account proprietario)
- Account "proprietario" (env `PREMIUM_OWNER_EMAILS`, CSV → config) hanno Premium permanente gratuito realizzato come VERO record `entitlements` (active, expiresAt=null), NON come bypass in isPremium → l'invariante "entitlements = unica fonte di verità" resta intatta.
- **Meccanismo**: seed idempotente all'avvio crea/aggiorna l'entitlement per le famiglie con un membro owner; un guard nella sync RevenueCat forza active per l'owner così la sync senza acquisto reale (active=false) non lo declassa mai.
- **Regola**: isPremium NON deve mai consultare la lista owner — un fallback email dentro isPremium rompe l'invariante (già bocciato in review). L'eleggibilità owner vale SOLO per seed+guard.
- **Why**: il proprietario voleva accesso a tutte le funzioni per sempre senza rompere il modello. La env è `shared`, quindi il prod applica la seed al boot dopo un republish.
- **Limite noto**: la seed è additiva (non revoca `owner_grant` se un account smette di essere owner). Accettabile per single-owner; aggiungere revoca solo se servirà.
