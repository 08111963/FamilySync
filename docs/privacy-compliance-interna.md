# Documentazione interna privacy — FamilySync

> Documento interno di controllo GDPR. Non destinato alla pubblicazione integrale agli utenti.
> Aggiornato al 24 luglio 2026 — Privacy Policy v2.1.

## 1. Tabella fornitori e DPA

| Provider | Funzione | Dati trattati | Ruolo | DPA verificato | SCC / meccanismo extra-SEE | Privacy policy | Sub-responsabili | Azione richiesta |
|---|---|---|---|---|---|---|---|---|
| Replit, Inc. | Hosting app e backend, deploy | Tutti i dati applicativi in transito/elaborazione | Responsabile (art. 28) | NO — da verificare nei ToS Replit | SCC/DPF dichiarati dal fornitore — da verificare | replit.com/privacy | Cloud provider sottostante | Verificare e archiviare i termini DPA di Replit |
| Neon, Inc. | Database PostgreSQL | Tutti i dati persistiti (account, famiglia, contenuti) | Responsabile (art. 28) | NO — da verificare | SCC dichiarate dal fornitore — da verificare | neon.tech/privacy | AWS/Azure | Verificare DPA Neon e regione dati |
| Plus Five Five, Inc. (Resend) | Email transazionali | Email destinatario, nome, contenuto email di servizio | Responsabile (art. 28) | NO — da verificare | SCC dichiarate — da verificare | resend.com/legal/privacy-policy | AWS/SES | Verificare DPA Resend |
| OpenAI (controparte contrattuale: da trascrivere dal DPA firmato) | Funzioni AI, trascrizione vocale, immagini ricette | Solo dati minimizzati (vedi §3), solo con consenso | Responsabile (art. 28) | SÌ — DPA verificato e firmato in data 23/07/2026 | Secondo i termini del DPA sottoscritto | openai.com/policies/privacy-policy | Secondo il DPA firmato | Nessuna — DPA archiviato |
| RevenueCat, Inc. | Abbonamenti/entitlements | ID utente app, stato abbonamento, ricevute store | Responsabile (art. 28) | NO — da verificare | SCC dichiarate — da verificare | revenuecat.com/privacy | AWS | Verificare DPA RevenueCat |
| Apple Inc. | IAP, Sign in with Apple, push APNs | Dati acquisto, identity token, token push | Titolare autonomo (per store/identità) | N/A | DPF/proprie garanzie | apple.com/legal/privacy | — | Nessuna (informativa propria) |
| Google LLC | Play Billing, Google OAuth, push FCM/browser | Dati acquisto, profilo OAuth (email, nome), token push | Titolare autonomo (per store/identità) | N/A | DPF/proprie garanzie | policies.google.com/privacy | — | Nessuna (informativa propria) |
| Expo (650 Industries) | Push notification service (native) | Token push Expo, payload notifica | Responsabile (di fatto) | NO — da verificare | Da verificare | expo.dev/privacy | AWS | Verificare termini push Expo (solo build store) |

Note:
- NON dichiarato nella policy che i DPA sono "in essere": formulazione prudente ("ove richiesto") come da regole operative.
- Stripe: presente nel codice ma DORMIENTE (nessun pagamento attivo) → volutamente NON elencato nella policy come fornitore attivo.
- Nessun SDK di analytics di terze parti, nessun servizio di advertising, nessuna moderazione esterna.

## 2. Tabella retention (verificata nel codice)

| Dato | Retention | Evidenza |
|---|---|---|
| Account e dati familiari | Fino a cancellazione account/famiglia | server/routes/auth.ts (delete-account), cascade schema |
| Token reset password | 1 ora | auth.ts: `60 * 60 * 1000` |
| Token verifica email | 6 ore | auth.ts: `6 * 60 * 60 * 1000` |
| Token invito famiglia | 72 ore | invites.ts: `72 * 60 * 60 * 1000` |
| Refresh token / sessioni | 7 giorni | lib/jwt.ts (refresh 7d) |
| Analytics interna test | max 30 giorni (default, env TEST_ANALYTICS_RETENTION_DAYS 1–30, tetto hard-coded) | server/routes/test-analytics.ts |
| Registro consensi | Durata account + obblighi di legge | shared/schema.ts consent_records (cascade su user delete) |
| Audio trascrizione vocale | Non conservato lato server (streaming verso OpenAI) | server/routes/ai.ts (transcribe) |
| Log di sistema | Per il tempo strettamente necessario a sicurezza/diagnostica, secondo le impostazioni tecniche dei provider di hosting (nessun termine massimo dichiarato in policy perché non controllato dal progetto) | logger applicativo/piattaforma |

## 3. Funzioni AI e dati realmente inviati a OpenAI

| Funzione | Endpoint | Dati inviati |
|---|---|---|
| Suggerimenti spesa | POST /api/ai/:familyId/shopping-suggestions | n. membri (senza nomi), articoli recenti, dispensa, titoli eventi, stagione |
| Ottimizzazione faccende | POST /api/ai/:familyId/chore-optimization | punti, titoli/durata faccende; membri indicati con alias temporanei ("Membro N"), riconciliati lato server |
| Insights famiglia / risparmio | POST /api/ai/:familyId/insights, /budget-insights | conteggi aggregati, spese per categoria, soprannome top contributor |
| Ricette / piani pasti | POST /api/ai/:familyId/recipes, meal-plan | preferenze alimentari, note libere sui pasti, ingredienti dispensa, titoli/descrizioni ricette; allergie/intolleranze SOLO con consenso separato `ai_health` (rimosse dal payload senza consenso) |
| Compilazione assistita (parse) | POST /api/ai/:familyId/parse-event, parse-chore, parse-bill, parse-expense | testo libero dettato/scritto dall'utente (può includere testi di eventi/faccende/bollette/spese, importi e categorie) |
| Trascrizione vocale | POST /api/ai/:familyId/transcribe | audio voce (solo per trascrizione, non salvato) |
| Foto ricette AI | POST /api/ai/recipe-image | titolo ricetta |

Dati mai inviati per progettazione: password, email account, ID interni (utente/famiglia), dati pagamento, allegati/ricevute, messaggi chat. NB: i campi di testo libero vengono inviati così come inseriti dall'utente, quindi possono contenere indirizzi, telefoni o dati di terzi se l'utente ve li scrive — la policy non fa più dichiarazioni assolute in merito e l'app mostra un avviso di minimizzazione vicino alle funzioni AI.

Gating: consenso per-utente (`users.ai_features_enabled`, opt-in, mai preselezionato) + consenso separato salute (`users.ai_health_consent`, opt-in, revocabile, registrato in consent_records come `ai_health`), quota giornaliera per famiglia, blocco server-side per `age_band = under14` (403 AI_DISABLED_MINOR in server/middleware/ai-guard.ts) e per account senza fascia d'età (onboarding obbligatorio).

## 4. Analytics realmente raccolti (periodo di test)

- Flag: `ENABLE_TEST_ANALYTICS` (spento = endpoint 404 anche non autenticati).
- Eventi: nome evento tecnico (es. app_open, screen_view, errore), timestamp, piattaforma, versione app; metadata filtrati da whitelist (server/routes/test-analytics.ts). Gli eventi sono associati a ID utente e ID famiglia; nella dashboard admin l'ID utente è collegabile all'email → sono dati personali di utilizzo (dichiarato in policy §10).
- Nessun contenuto personale (messaggi, titoli, importi), nessun token, nessun IP salvato negli eventi. Nessun uso pubblicitario/profilazione, nessuna vendita.
- Accesso: solo amministratori autorizzati via `APP_OWNER_EMAILS`, protezione lato backend (verifica su DB a ogni richiesta; flag spento = 404 anche non autenticati).
- Cancellazione account: gli eventi associati all'utente vengono eliminati (server/lib/account-deletion.ts).
- Retention: `TEST_ANALYTICS_RETENTION_DAYS` (default 30, limiti 1–30: il codice non può superare la policy), cleanup automatico.

## 5. Consensi e minori — implementazione

- Registro consensi: tabella `consent_records` (migrazione 0014), append-only, scritta a: signup, social signup, invito, join-link, toggle AI (PATCH /api/moderation/preferences).
- Consultazione utente: GET /api/moderation/consents → Centro Privacy in app.
- Opt-in AI: tutti i nuovi utenti nascono con `ai_features_enabled = false`; checkbox signup NON preselezionata.
- Minori: fascia età al signup (`users.age_band`), `under14` rifiutato al signup (403 UNDER_AGE); profili under14 creati dall'adulto → AI bloccata server-side.
- Informativa minori: /legal/minori (web) + app/legal/minors.tsx (mobile), linkate dal Centro Privacy.

## 5-bis. Sicurezza segreti — rotazione chiavi VAPID (24 luglio 2026)

- La chiave privata VAPID (notifiche push web) era presente nel file di configurazione `.replit`: è stata **rimossa** e sostituita con una **nuova coppia di chiavi (rotazione eseguita il 24/07/2026)**; la chiave privata vive ora solo nei Replit Secrets.
- La vecchia chiave esposta NON deve più essere usata; le sottoscrizioni push web esistenti andranno rinnovate dal browser.
- Il file `.replit` e ogni file di chiavi/credenziali sono esclusi dallo ZIP di consegna (`scripts/export-consegna.sh`, con doppia scansione per nome e per contenuto).

## 6. Informazioni NON verificabili (da completare a cura del titolare)

- Firma effettiva dei DPA con Replit, Neon, Resend, RevenueCat, Expo (da verificare nei rispettivi dashboard/ToS).
- DPA OpenAI: verificato e firmato in data 23/07/2026 — nessuna azione residua.
- Adesione attuale dei fornitori al Data Privacy Framework (le adesioni cambiano nel tempo).
- Localizzazione fisica esatta dei dati presso ciascun fornitore.
- Applicazione della migrazione 0014 al database di PRODUZIONE (dev e prod separati: da eseguire al prossimo deploy).
