---
name: Demo account seed (store reviewers)
description: Reusable seed for an Apple/Google reviewer demo account and the constraints it must satisfy.
---

# Demo account seed per revisori store

Script: `scripts/seed-demo-account.ts`, eseguibile con `npx tsx scripts/seed-demo-account.ts`. Stampa le credenziali a fine run.

## Vincoli non ovvi (perche l'account demo deve essere fatto cosi)
- **emailVerified DEVE essere true.** Tutte le route `/api/*` sono montate con il middleware `requireEmailVerified` (esportato come `n`); senza email verificata il revisore riceve 403 su ogni funzione. Il login NON la richiede, ma tutto il resto si.
  **Why:** un account demo "appena registrato" sembra loggare ma poi fallisce ovunque.
- **Premium si sblocca SOLO via tabella `entitlements`** (`status="active"`, `expiresAt` null = permanente), letta da `isPremium` in `server/lib/entitlements.ts`. `families.subscriptionStatus` e solo un mirror, non sblocca nulla.
  **How to apply:** per dare Premium al demo, inserire una riga entitlements active; non basta impostare subscriptionStatus.

## Dev e PROD sono database separati (lezione operativa)
- Lo script CLI `npx tsx scripts/seed-demo-account.ts` scrive solo nel DB di **sviluppo** (DATABASE_URL del workspace). La produzione (familysync.eu) usa un DB separato e live con utenti reali.
  **Why:** dopo il seed CLI, il login demo funzionava in dev ma dava 401 sull'app pubblicata; la replica prod (executeSql environment:"production", sola lettura) non mostrava l'utente demo.
- Non c'e write diretto al DB di prod dagli strumenti (executeSql prod = solo SELECT). La via supportata: far girare il seeding nell'ambiente di produzione **all'avvio**.
  **How to apply:** `ensureDemoAccount()` (server/lib/demo-account.ts, modalita crea-se-manca) e chiamata in server/index.ts accanto a `seedOwnerEntitlements`. Entra in prod solo dopo un **nuovo Publish**; un cambio di codice non basta finche non si rideploya.

## Idempotenza sicura (lezione dalla code review)
- Il cleanup cancella SOLO la famiglia con nome marker `DEMO_FAMILY_NAME` ("Famiglia Demo") a cui appartengono gli utenti demo, mai tutte le famiglie dei demo user.
  **Why:** una cleanup che cancella ogni famiglia contenente un demo user puo distruggere dati reali via ON DELETE CASCADE se l'account demo venisse aggiunto a una famiglia vera.
- Tutto il seed gira in `db.transaction(...)` per rollback completo su errore (niente stati parziali / famiglie orfane).
