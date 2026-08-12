---
name: AuthGate redirect loops (React #185)
description: Perché le regole di redirect in AuthGate possono creare loop infiniti e come tenerle stabili.
---

**Regola:** in `app/_layout.tsx` (AuthGate) ogni ramo di `router.replace` deve essere mutuamente esclusivo con gli altri: un account può soddisfare più condizioni contemporaneamente (es. email NON verificata E onboarding incompleto) e senza guardie esplicite i due redirect si contendono la rotta all'infinito → React #185 ("Something went wrong").

**Why:** caso reale in produzione (2026-08): familiare registrato senza verificare l'email né completare l'onboarding → ping-pong /verify-email ↔ /onboarding su ogni pagina, app inutilizzabile. Riprodotto in locale con utente dev `email_verified=false` + `age_band NULL`.

**returnTo inviti:** AuthGate conserva la destinazione `/join*` in `?returnTo=` quando dirotta su verify-email/onboarding (regex allow-list anti open-redirect); nel layout radice usare `useGlobalSearchParams` (useLocalSearchParams NON vede i parametri della schermata attiva). Anche i pulsanti "Vai alla verifica email" delle pagine invito devono propagare returnTo.

**How to apply:**
- Priorità: non autenticato → verifica email → onboarding → resto. Ogni nuovo ramo deve escludere gli stati precedenti (es. `needsOnboarding && !needsVerification`).
- In `context/AuthContext.tsx` le callback (refreshAccessToken/refreshUser) devono restare STABILI: leggere `user` da `userRef`, mai metterlo nelle deps, e `refreshUser` non fa `setUser` se i dati sono JSON-uguali. Altrimenti la catena refreshUser → handleCheck → useFocusEffect (verify-email) si rigenera a ogni render.
- Repro rapido: creare utente dev non verificato (hash copiato dal tester), login via API, localStorage `@family_sync_auth`, Playwright su `/` e `/join-link/<code>`.
- Attenzione al rate limiter login per-email nei test ripetuti (attendere ~4 min).
