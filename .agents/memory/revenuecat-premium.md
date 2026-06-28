---
name: RevenueCat Premium (FamilySync)
description: Come funziona il Premium store-native via RevenueCat e i vincoli non ovvi del flusso.
---

# Premium = RevenueCat (store-native), Stripe fuori dal mobile

Il Premium mobile usa RevenueCat come motore acquisti. Il client NON decide il Premium:
dopo purchase/restore chiama `POST /api/purchases/sync {familyId}`; il backend interroga
RevenueCat REST (AppUserID = familyId) e fa upsert sulla tabella `entitlements`, che resta
la fonte operativa. `isPremium(familyId)` è letto SEMPRE dal DB.

**Why:** separare verifica server-side da UI evita che un client modificato attivi il Premium.

## Vincoli non ovvi
- **Ruoli famiglia**: l'enum `role` è `["admin","adult","teen","child"]` — NON esiste "owner".
  Chi crea la famiglia è `admin`. Il gate "solo owner/admin acquista" si traduce in `role === "admin"`.
  Enforcement sia UI (premium.tsx) sia server (`/api/purchases/sync` controlla `req.membership.role`).
- **Webhook RevenueCat** (`POST /api/purchases/webhook`): pubblico, montato PRIMA del mount
  autenticato di `/api/purchases` in routes.ts. Auth via header `REVENUECAT_WEBHOOK_AUTH_HEADER`.
  Fail-closed in produzione: se l'header non è configurato e `NODE_ENV=production`, risponde 503.
  In dev è tollerato non autenticato.
- **Prezzi**: la Premium screen legge i prezzi dall'offering RevenueCat (`availablePackages`,
  packageType MONTHLY/ANNUAL o id `$rc_monthly`/`$rc_annual`), fallback €3,99/€39,99. Mai hardcode.
- **logIn**: `loginRevenueCat(familyId)` va chiamato al cambio `currentFamilyId` (FamilyContext),
  così gli acquisti sono per-famiglia (AppUserID=familyId).
- **Test mode** (`isRevenueCatTestMode`: __DEV__ / web / Expo Go): mostrare una conferma con
  Modal custom (NON Alert) prima dell'acquisto simulato.

**How to apply:** per modifiche al Premium mobile, non reintrodurre verifier IAP custom né
endpoint /verify o /restore; passare sempre da RevenueCat + /sync. react-native-purchases
funziona in Expo Go (Preview API Mode) e su web.
