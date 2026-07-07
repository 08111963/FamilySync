---
name: Premium / freemium model (entitlements)
description: How Premium status, AI quotas, and store purchases work in FamilySync
---

# Premium = entitlements, single source of truth

- **`isPremium(familyId)` in `server/lib/entitlements.ts` is the ONLY source of truth.** It reads the `entitlements` table (one row per family, unique on familyId) and returns true only for status=active and not expired. **Fail-closed**: any error → false.
- **`families.subscriptionStatus` is a MIRROR, never a gate.** `applyPurchase` syncs it ("premium"/"free") for display only. Do NOT branch premium logic on it anywhere (backend or frontend). The old cosmetic-gating model that OR-ed `subscriptionStatus in premium|active|trialing` was removed.
- `app/premium.tsx` reads premium state ONLY from `GET /api/purchases/status/:familyId` (derived from entitlements) — no `currentFamily.subscriptionStatus` fallback.
- `server/middleware/ai-guard.ts`: when `config.aiRequiresPremium` is true it gates via `isPremium(familyId)`, not the families table. With the flag false (default), AI is open to any consenting user (GDPR `users.aiFeaturesEnabled`).

# Frontend Premium must read backend status, NOT client RevenueCat
- The client-side `useSubscription()` (`lib/revenuecat.tsx`) must derive `isSubscribed` from `GET /api/purchases/status/:familyId` (entitlements), the SAME source as `app/premium.tsx` — NOT from `Purchases.getCustomerInfo().entitlements.active[...]`.
- **Why:** the RevenueCat client customerInfo is empty for any server-side grant without a real store purchase (e.g. `owner_grant`), so reading it showed Premium families as "Piano Free" on the Bills tab. Every premium consumer (bills banner, bill detail gating, BillNotifications plan) flows through `useSubscription`, so this one source must be backend-driven.
- `SubscriptionProvider` must sit INSIDE `FamilyProvider` (provider order in `app/_layout.tsx`) so `useSubscription` can call `useFamily()` for the familyId. This creates a lazy circular import FamilyContext<->revenuecat — safe because both imports are used only inside hooks/effects, never at module top level.

# Premium gating must cover READS, not just writes
- Detail/GET endpoints that bundle premium-only sub-resources (e.g. bills detail returning splits/attachments/history) must gate EACH premium sub-resource on `getPlanForFamily`/`isPremium`, returning `[]` for free families — not only the write endpoints.
- **Why:** a UI lock alone is bypassable via the raw API; if a GET returns premium data to free families the backend stops being the single source of truth. Mirror every write-gate with a read-gate.

# AI is freemium by QUOTA, not by paywall
- AI is never sold separately. The free/premium difference is ONLY the per-plan quota in `PLAN_LIMITS` (`server/lib/ai-usage.ts`), resolved server-side in `reserveAiSlot` via `getPlanForFamily`. Quotas have a `window` of `day|week`; the 429 message reflects which.
- **Quotas are PER FAMILY (shared pool), not per member** — enforced by `store.reserve` counting `ai_usage` rows by `familyId`. This is a stated user requirement; the Premium card (`app/premium.tsx`) and guide surface it explicitly ("condivisi da tutta la famiglia"). Do NOT switch to per-user counting without an explicit request.
- **Premium quotas were raised +5 across every limited feature** (shopping-suggestions 15, recipe-search 25, recipe-suggestions 15, weekly-meal-plan 8/day, insights 10/day, chore-optimization 15, voice-transcription 35, recipe-image 55).
- **Why:** requirement was a real freemium model — AI stays demoable for free families but limited; premium unlocks higher quotas.
- **Family admins bypass AI quotas entirely.** `reserveAiSlot` checks the requester's `family_members.role`; if `admin`, it sets `effectiveMax = Number.MAX_SAFE_INTEGER` so they are never rate-limited (usage is still tracked in `ai_usage`). The admin lookup fails closed to non-admin on DB error.
- **Why:** explicit user requirement — the family admin/owner must never hit AI limits. Centralized in `reserveAiSlot` so every feature using `reserveAiSlot`/`withAiUsage` inherits it.

# Premium is store-native only (IAP), Stripe stays dormant
- Purchases are verified server-side by an injectable verifier (`server/lib/iap-verifier.ts`, `__setIapVerifierForTest`): real Apple verifyReceipt + Google Play subscriptions API. Real verification runs ONLY when store credentials are configured (`config.isIapVerificationConfigured`), else 503 `PURCHASE_VERIFICATION_UNAVAILABLE`.
- **Never trust client `productId`** in `/api/purchases/verify|restore` — the route forces `config.premiumProductIdFor(platform)` so a client can't validate a different SKU into a premium entitlement.
- **`lib/iap.ts` (client) is intentionally a STUB**: `isIapAvailable()` returns false; purchase/restore throw `IAP_NOT_AVAILABLE`. Real native IAP (StoreKit / Play Billing) needs a production native build + store credentials — not possible in Expo Go. The backend + verification are fully real and unit-tested with a fake verifier.
- Stripe remains dormant (`PREMIUM_PAYMENTS_ENABLED=false`) and must NOT unlock mobile premium. `premium-disabled.test.ts` guards the no-Stripe invariant.

# Free-plan daily caps on BASE (non-AI) creation actions
- **Free = max 5 creations/day PER FUNCTION, PER FAMILY (shared pool); Premium = unlimited.** Features capped: calendar-event, shopping-item, chore, chat-message. Each has its OWN counter (5 events AND 5 items AND 5 chores AND 5 messages).
- Enforced by `reserveBaseSlot(userId, familyId, feature)` in `server/lib/base-usage.ts`, called BEFORE the resource insert in every creation route; on `status:"limited"` the handler returns `429` with `baseLimitBody(...)` (code `FREE_DAILY_LIMIT_REACHED`). Same advisory-lock-in-tx count+insert pattern as `reserveAiSlot`.
- **Reuses the `ai_usage` table** with a `base:` feature prefix (no migration; feature is varchar, index (familyId,feature,createdAt) reused). Premium → `{status:"ok"}` immediately.
- **Base features are FAIL-OPEN** (DB error → allow) — opposite of AI (fail-closed), because base actions are core UX and free (no per-call cost). **No admin bypass** — this is a plan limit, not a role limit (unlike AI quotas which admins bypass).
- **All creation sink paths must be gated, or the cap leaks.** The meal-plan→shopping conversion (`meal-plans.ts` to-shopping-list) also reserves ONE `shopping-item` slot; if you add another route that inserts calendarEvents/shoppingItems/chores/chatMessages for a user action, gate it too. Derived inserts (chore→calendar, bill→calendar) intentionally NOT counted.
- Frontend surfaces the 429 via `freeLimitMessage(err)` in `lib/plan-limit.ts`; `lib/query-client.ts` `throwIfResNotOk` attaches `status`/`body` to thrown errors so both `apiRequest` (Error) and `apiFetch`/`apiUpload` ({status,body}) shapes work. Wired in FamilyContext (addEvent/addShoppingItem), add-chore, chat (send+uploads), meal-plans convert.
- **Why:** explicit user requirement (BUILD mode, "non prendere iniziative non richieste") — an earlier note said this idea was abandoned; it was later explicitly re-requested. The Premium card and guida-utente.md both state "5 / giorno ... condivisi da tutta la famiglia".

# Free-plan hard limits: family members + voice dictation
- **Free = max 5 family members; Premium = unlimited.** Gate = `isFamilyMemberLimitReached(familyId)` (fast pre-check) + `isFamilyMemberLimitReachedTx(tx, familyId)` (authoritative) in `server/lib/entitlements.ts`; error is `403 MEMBER_LIMIT_REACHED`. Premium → always false.
- **The real enforcement is ATOMIC inside the member-insert transaction** (join + invite-accept): `isFamilyMemberLimitReachedTx` takes `pg_advisory_xact_lock(hashtext('family-members:'+familyId))` then counts, so concurrent joins can't both see count=4 and exceed 5. The pre-transaction check is only a fast-fail UX guard — do NOT rely on it alone.
- **Why:** a count-then-insert check outside a lock is racy (review caught it); the advisory-lock-in-tx pattern mirrors the AI-quota one and is the project convention for count-based caps.
- Voice dictation (`voice-transcription` in `PLAN_LIMITS`, `ai-usage.ts`) is a single shared daily quota across all mic features (events, chores, recipes, meal-plan, chat): Free = 3/day, Premium = 35/day.

# Owner premium permanente (account proprietario)
- Account "proprietario" (env `PREMIUM_OWNER_EMAILS`, CSV → config) hanno Premium permanente gratuito realizzato come VERO record `entitlements` (active, expiresAt=null), NON come bypass in isPremium → l'invariante "entitlements = unica fonte di verità" resta intatta.
- **Meccanismo**: seed idempotente all'avvio crea/aggiorna l'entitlement per le famiglie con un membro owner; un guard nella sync RevenueCat forza active per l'owner così la sync senza acquisto reale (active=false) non lo declassa mai.
- **Regola**: isPremium NON deve mai consultare la lista owner — un fallback email dentro isPremium rompe l'invariante (già bocciato in review). L'eleggibilità owner vale SOLO per seed+guard.
- **Why**: il proprietario voleva accesso a tutte le funzioni per sempre senza rompere il modello. La env è `shared`, quindi il prod applica la seed al boot dopo un republish.
- **Limite noto**: la seed è additiva (non revoca `owner_grant` se un account smette di essere owner). Accettabile per single-owner; aggiungere revoca solo se servirà.
