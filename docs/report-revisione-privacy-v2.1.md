# Report finale — Revisione Privacy Policy v2.1 e adeguamenti GDPR

Data: 23 luglio 2026 — FamilySync

## 1. Elenco modifiche

### Policy e informative
- Privacy Policy riscritta in **Versione 2.1 (23 luglio 2026)** in entrambe le copie: pagina web pubblica `/legal/privacy` e schermata in-app (`app/legal/privacy.tsx`). Versione e data provengono da un'unica fonte condivisa (`shared/policy-version.ts`).
- Formulazione prudente sui fornitori: nessun DPA dichiarato "in essere" (il DPA OpenAI è in corso di firma e non viene dichiarato attivo).
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
- DPA OpenAI: in corso di firma — completare e archiviare.
- Adesione attuale dei fornitori al Data Privacy Framework.
- Localizzazione fisica esatta dei dati presso i fornitori.

## 5. Azioni dopo la pubblicazione (IMPORTANTE)

Il database di produzione è separato da quello di sviluppo. Dopo il Republish vanno applicate al DB di produzione le migrazioni:
- `migrations/0014_privacy_consent.sql` (registro consensi + fascia età)
- `migrations/0015_ai_optin_default.sql` (default AI opt-in)

## 6. Documenti collegati

- `docs/privacy-compliance-interna.md` — tabella fornitori/DPA, retention, funzioni AI e dati inviati, analytics.
- ZIP consegna: `familysync-consegna-v2.1.zip` (esclusi node_modules, build, cache, log, .env, upload utenti, zip precedenti).
