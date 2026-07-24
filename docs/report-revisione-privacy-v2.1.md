# Report finale — Revisione Privacy Policy v2.1 e adeguamenti GDPR

Data: 23 luglio 2026 — FamilySync

## 1. Elenco modifiche

### Policy e informative
- Privacy Policy riscritta in **Versione 2.1 (23 luglio 2026)** in entrambe le copie: pagina web pubblica `/legal/privacy` e schermata in-app (`app/legal/privacy.tsx`). Versione e data provengono da un'unica fonte condivisa (`shared/policy-version.ts`).
- Formulazione prudente sui fornitori: nessun DPA dichiarato "in essere" senza prova. Eccezione: **DPA OpenAI verificato e firmato in data 23/07/2026**.
- I Termini d'Uso mantengono la loro data (30 giugno 2026) e il titolare della proprietà intellettuale invariato.
- Nuova **informativa semplificata per minori**: pagina pubblica `/legal/minori` + schermata in-app.

### Adeguamenti tecnici
- **Fascia d'età alla registrazione** (under 14 / 14–17 / adulto): gli under 14 non possono registrarsi (blocco lato server con errore dedicato); nessuna data di nascita completa (minimizzazione).
- **Consenso AI opt-in reale**: checkbox mai preselezionata alla registrazione; default `false` anche a livello di database (migrazione 0015); blocco AI lato server per profili under 14.
- **Registro consensi** (migrazione 0014, tabella `consent_records`): registrato a signup, login social, inviti e toggle AI; il toggle AI è transazionale (se il registro non scrive, il cambio viene annullato).
- **Centro Privacy in app**: toggle AI, storico consensi, link alle informative.
- **Etichetta "Generato con AI"** sui contenuti AI (insights e consigli budget).
- **Analytics di test**: retention con tetto massimo 30 giorni nel codice (non può superare quanto dichiarato in policy); accesso solo owner; endpoint spenti (404) senza flag.

## 2. Test eseguiti (FASE 5)

- TypeScript: `tsc --noEmit` pulito.
- Suite backend: 24 file di test, tutti verdi (unica modifica ai test: gestione della variabile `OPENAI_API_KEY` presente nell'ambiente, non per nascondere errori).
- Verifiche manuali via HTTP: rotte legali pubbliche (200 senza login), versione/data coerenti web+app, nessun provider non presente citato in policy.

## 3. Matrice dichiarazione / evidenza / esito

| Dichiarazione policy | Evidenza nel codice | Esito |
|---|---|---|
| Titolare: FamilySync, contatto assistenza@familysync.it | `server/routes/legal.ts` (OWNER, CONTACT_EMAIL) | OK |
| Policy accessibile senza account | Rotte `/legal/*` senza middleware auth | OK |
| Consenso AI opt-in, mai preselezionato | `app/login.tsx` (checkbox false), `shared/schema.ts` default false, migrazione 0015 | OK |
| Revoca consenso AI effettiva e immediata | `PATCH /api/moderation/preferences` + guard `requireAiEnabled` | OK |
| AI vietata sotto i 14 anni | signup 403 UNDER_AGE + `ai-guard.ts` AI_DISABLED_MINOR | OK |
| Registro consensi consultabile | `GET /api/moderation/consents` + Centro Privacy | OK |
| Dati AI minimizzati (no password, pagamenti, chat) | prompt in `server/routes/ai.ts` (vedi doc interna §3) | OK |
| Audio vocale non conservato | `transcribe` non salva file | OK |
| Analytics max 30 giorni, senza contenuti sensibili | `server/lib/test-analytics.ts` (cap 30, whitelist metadata) | OK |
| Cancellazione account con revoca sessioni | `delete-account` + cascata DB + refresh token eliminati | OK |
| Token reset 1h / verifica 6h / inviti 72h / sessioni 7gg | costanti in `auth.ts`, `invites.ts`, `jwt.ts` | OK |
| DPA fornitori "ove richiesto" (nessuno dichiarato attivo) | testo policy §13 | OK (prudente) |
| Nessun provider inesistente citato (no Stripe, no analytics terzi) | policy cita solo fornitori attivi | OK |

## 4. Informazioni non verificabili (a cura del titolare)

- Firma effettiva dei DPA con Replit, Neon, Resend, RevenueCat, Expo.
- DPA OpenAI: verificato e firmato in data 23/07/2026 — nessuna azione residua.
- Adesione attuale dei fornitori al Data Privacy Framework.
- Localizzazione fisica esatta dei dati presso i fornitori.

## 5. Azioni dopo la pubblicazione (IMPORTANTE)

Il database di produzione è separato da quello di sviluppo. Dopo il Republish vanno applicate al DB di produzione le migrazioni:
- `migrations/0014_privacy_consent.sql` (registro consensi + fascia età)
- `migrations/0015_ai_optin_default.sql` (default AI opt-in)
- `migrations/0016_social_completion_health_consent.sql` (completamento social, versione policy vista, consenso salute AI, onboarding)

## 5-bis. Correzioni v2.1-bis (24 luglio 2026)

### Sicurezza e segreti
- **Chiave privata VAPID rimossa dal file `.replit`** e spostata nei Replit Secrets. **IMPORTANTE: la chiave precedentemente esposta è stata sostituita con una nuova coppia di chiavi (rotazione eseguita); la vecchia chiave non deve più essere utilizzata.** Le sottoscrizioni push web esistenti andranno rinnovate dal browser.
- `docs/tester-accounts.pdf` rimosso dal repository e dallo ZIP; nessuna password tester nel progetto.
- `.gitignore` e nuovo script `scripts/export-consegna.sh` escludono: `.env*`, chiavi private, secret, credenziali, PDF tester, ZIP precedenti, log, file temporanei, upload utenti, build. Lo script esegue una scansione finale e annulla la consegna se trova file sensibili.

### Registrazione social (Google/Apple) con consenso reale
- Nuovo utente social: l'account NON viene più creato automaticamente. Viene emesso un **codice temporaneo monouso a scadenza** e si apre la schermata di completamento (`app/social-complete.tsx`) che richiede nome, fascia d'età (obbligatoria), dichiarazione di presa visione della Privacy Policy, accettazione esplicita dei Termini e scelta AI facoltativa (mai preselezionata). Solo alla conferma l'account viene creato (POST `/api/auth/social/complete`).
- Nessuna impostazione automatica di `termsAcceptedAt`, consenso AI, maggiore età o presa visione della policy.

### Fascia d'età obbligatoria ovunque
- Obbligatoria lato server per ogni flusso di registrazione (email, social, inviti, join-link, tester/demo/VIP). Un account senza fascia d'età ha `needsOnboarding = true`, viene indirizzato all'onboarding (`app/onboarding.tsx`, POST `/api/auth/onboarding`) e non può usare gli endpoint AI. Nessun utente con fascia mancante è considerato adulto.
- Account tester/demo/VIP: AI disattivata, nessun consenso simulato, onboarding obbligatorio al primo accesso; l'eventuale Premium di prova è indipendente dal consenso AI.

### Consenso salute separato (allergie/intolleranze)
- Nuovo consenso `ai_health` (migrazione 0016): facoltativo, esplicito, mai preselezionato, distinto dal consenso AI generale, registrato con data e versione, revocabile dal Centro Privacy. Senza consenso le allergie/intolleranze vengono rimosse dai payload AI e l'utente è informato che i suggerimenti non ne terranno conto.

### Wording e Centro Privacy
- Ovunque: "Dichiaro di aver letto la Privacy Policy e accetto i Termini d'Uso." (la policy è un'informativa, non un consenso contrattuale).
- Voce del registro consensi rinominata in "Accettazione dei Termini d'Uso".
- Centro Privacy completato: versioni/date di Policy e Termini, data di accettazione dei Termini, stato consensi AI e AI-salute, spiegazione analytics di test, elenco fornitori principali, email cliccabile assistenza@familysync.it, link a richiesta/esportazione dati e a Elimina account, link informativa minori.

### Policy v2.1 aggiornata (testi)
- §7 AI: elenco dati realmente inviati (note libere pasti, importi/categorie, testi eventi/faccende/bollette/spese; faccende con alias "Membro N" al posto dei soprannomi); rimossa la dichiarazione assoluta su indirizzi/telefoni "mai inviati"; avvertenza di minimizzazione (replicata nell'app vicino alle funzioni AI); paragrafo sul consenso salute separato.
- §10 Analytics: dichiarata l'associabilità a ID utente/famiglia e il collegamento ID-email in dashboard admin; niente pubblicità/profilazione/vendita; eliminazione eventi alla cancellazione account.
- Retention log: rimossa la promessa "massimo 12 mesi" (non tecnicamente controllabile), sostituita con formulazione coerente con i provider di hosting (anche nella pagina Eliminazione Account).
- Fascia d'età indicata come obbligatoria nella sezione Dati Raccolti.

## 6. Documenti collegati

- `docs/privacy-compliance-interna.md` — tabella fornitori/DPA, retention, funzioni AI e dati inviati, analytics.
- ZIP consegna: `familysync-consegna-v2.1.zip` (esclusi node_modules, build, cache, log, .env, upload utenti, zip precedenti).
