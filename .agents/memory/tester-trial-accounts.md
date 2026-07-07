---
name: Tester trial accounts (Google Play)
description: How the 15 Google Play tester accounts and the time-limited free trial work in FamilySync.
---

# Account tester + prova a tempo

15 account tester (tester01..15@familysync.eu) con Premium completo per N giorni **dal primo login**, poi solo funzioni free.

- **Trial = entitlement con `entitlements.trial_days` valorizzato.** Seed crea l'entitlement in stato `pending`. Al primo login `activatePendingTrialsForUser(userId)` (chiamato in POST /api/auth/login dopo la verifica password) fa il flip `pending -> active` con `expires_at = now + trial_days`. isPremium usa l'entitlement come unica fonte di verità (fail-closed), quindi alla scadenza torna free automaticamente.
- **Attivazione atomica/idempotente:** l'UPDATE è condizionato `WHERE id=? AND status='pending' RETURNING`. Login concorrenti → solo il primo avvia i giorni; login successivi non riavviano la scadenza.
- **Guard RevenueCat:** `syncEntitlementFromRevenueCat` PRESERVA le trial `pending` o `active` non scadute dal downgrade quando RC risponde `active=false`. Le trial scadute passano oltre e degradano a free.

**Why:** i revisori/tester Google Play devono provare tutto per un periodo limitato senza pagare, senza che un sync RevenueCat le disattivi anzitempo.

## Password e PDF
- Password DERIVATE deterministicamente da `TESTER_PASSWORD_SEED || SESSION_SECRET` via HMAC-SHA256 (formato AAAA-BBBB-CCCC-DDDD, alfabeto senza ambigui). Nessun plaintext salvato nel DB → riproducibili in prod (secret globale).
- `scripts/seed-tester-accounts.ts` fa `ensureTesterAccounts({reset,force})` + genera `docs/tester-accounts.pdf`.
- **`docs/tester-accounts.pdf` è gitignored** (contiene password in chiaro): NON versionare, rigenerare on-demand e consegnare in canale sicuro.
- Seed è idempotente a boot (gate `ENABLE_TESTER_ACCOUNTS=true`), marker-scoped su famiglie "Famiglia Tester", advisory-lock transazionale come demo-account.
- Colonna prod: `migrations/0005_add_entitlements_trial_days.sql` (dev applicata via drizzle-kit push).
