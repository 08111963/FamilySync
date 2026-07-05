# FamilySync - App di Coordinamento Familiare

## Panoramica

FamilySync è un'applicazione mobile-first per il coordinamento familiare costruita con Expo React Native per il frontend e Express.js per il backend. L'app aiuta le famiglie a gestire le attività quotidiane inclusi eventi calendario, liste della spesa, faccende domestiche e coordinamento dei membri familiari. L'applicazione supporta iOS, Android e web attraverso le capacità cross-platform di Expo.

L'app è progettata per essere production-ready per App Store e Google Play, con un'interfaccia pulita in lingua italiana, feedback tattile, supporto dark mode e gestione dati offline-first.

## Preferenze Utente

Stile di comunicazione preferito: Linguaggio semplice e quotidiano.
Lingua di comunicazione: Rispondere SEMPRE in italiano.

## Architettura Sistema

### Architettura Frontend
- **Framework**: Expo SDK 54 con React Native 0.81
- **Routing**: expo-router v6 con file-based routing e typed routes
- **Gestione Stato**: 
  - React Context (FamilyContext) per dati famiglia globali
  - TanStack React Query per gestione stato server
  - AsyncStorage per persistenza locale
- **Componenti UI**: Libreria componenti custom (Avatar, Button, Card, Input, EmptyState)
- **Styling**: React Native StyleSheet con supporto temi (light/dark mode)
- **Navigazione**: Tab navigation con 5 schermate principali (Home, Calendario, Spesa, Faccende, Famiglia)

### Architettura Backend
- **Framework**: Express.js v5
- **Linguaggio**: TypeScript con tsx per sviluppo
- **Pattern API**: Endpoints RESTful con prefisso `/api`
- **Database ORM**: Drizzle ORM con dialetto PostgreSQL
- **Validazione Schema**: Zod con integrazione drizzle-zod
- **Autenticazione**: JWT con access token (15 min) e refresh token (7 giorni)
- **Real-time**: Socket.io per sincronizzazione eventi tra dispositivi
- **AI**: OpenAI integration per suggerimenti intelligenti
- **Pagamenti**: Stripe integration per abbonamenti Premium

### Storage Dati
- **Database Principale**: PostgreSQL (Neon) configurato via DATABASE_URL
- **Storage Locale**: AsyncStorage per caching dati famiglia offline-first
- **Location Schema**: `shared/schema.ts` - contiene 13 tabelle database
- **Migrazioni**: Drizzle Kit con output migrazioni in `./migrations`

### Tabelle Database
1. `users` - Utenti registrati con autenticazione
2. `families` - Gruppi familiari
3. `family_members` - Relazioni utente-famiglia
4. `family_invites` - Inviti in sospeso
5. `calendar_events` - Eventi calendario condiviso
6. `shopping_lists` - Liste della spesa
7. `shopping_items` - Items nelle liste
8. `chores` - Faccende domestiche con gamification
9. `chore_completions` - Storico completamenti
10. `ai_insights` - Suggerimenti AI generati
11. `refresh_tokens` - Token di sessione
12. `verification_tokens` - Token verifica email
13. `password_reset_tokens` - Token reset password

### API Routes
- `/api/auth` - Registrazione, login, refresh token, verifica email
- `/api/families` - CRUD famiglie, inviti membri
- `/api/calendar` - Gestione eventi calendario
- `/api/shopping` - Liste e items spesa
- `/api/chores` - Faccende con punti e classifiche
- `/api/ai` - Suggerimenti AI per spesa e ottimizzazione
- `/api/payments` - Prodotti Stripe, checkout, abbonamenti

### Pattern Design Chiave
- **Offline-First**: Dati famiglia salvati localmente e sincronizzati quando disponibile
- **Cross-Platform**: Codebase singola per iOS, Android e web con Expo
- **Type Safety**: Copertura TypeScript completa con strict mode
- **Error Boundaries**: Implementazione React error boundary
- **Haptic Feedback**: Integrazione expo-haptics per feedback tattile
- **Real-time Sync**: Socket.io per aggiornamenti live tra dispositivi

### Struttura Progetto
```
├── app/                    # Expo Router file-based routes
│   ├── (tabs)/            # Schermate tab navigation
│   ├── _layout.tsx        # Root layout con providers
│   └── [modals].tsx       # Schermate modali
├── components/            # Componenti UI riutilizzabili
├── constants/             # Colori tema e costanti
├── context/               # React Context providers
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
├── scripts/               # Script utility (seed-stripe-products.ts)
├── server/                # Express.js backend
│   ├── index.ts          # Entry point server
│   ├── routes.ts         # Registrazione API routes
│   ├── db.ts             # Connessione database
│   ├── lib/              # JWT, WebSocket, OpenAI, Stripe clients
│   ├── middleware/       # Auth middleware
│   └── routes/           # Route handlers
├── shared/                # Codice condiviso frontend/backend
│   └── schema.ts         # Schema database Drizzle
└── types/                 # Definizioni TypeScript
```

## Dipendenze Esterne

### Database
- **PostgreSQL (Neon)**: Database principale
- **Drizzle ORM**: Toolkit database per query SQL type-safe

### Librerie Core
- **Expo SDK**: Framework sviluppo mobile cross-platform
- **Express.js**: Framework HTTP server backend
- **TanStack React Query**: Gestione stato server
- **Socket.io**: Comunicazione real-time bidirezionale
- **bcryptjs**: Hashing password
- **jsonwebtoken**: Gestione JWT
- **Stripe**: Elaborazione pagamenti

### AI/ML
- **OpenAI**: API per suggerimenti intelligenti (shopping, chores optimization)

### UI/UX
- **@expo-google-fonts/inter**: Font family Inter
- **@expo/vector-icons**: Libreria icone (Ionicons)
- **expo-haptics**: Feedback tattile
- **expo-linear-gradient**: Gradienti sfondo

### Sicurezza
- **helmet**: Headers sicurezza HTTP
- **express-rate-limit**: Rate limiting API

### Variabili Ambiente Richieste
- `DATABASE_URL`: Connection string PostgreSQL
- `SESSION_SECRET`: Secret per JWT signing
- `EXPO_PUBLIC_DOMAIN`: Dominio pubblico per richieste API
- `REPLIT_DEV_DOMAIN`: Dominio sviluppo (Replit-specific)

### Variabili Opzionali
- `OPENAI_API_KEY`: Per funzionalità AI (suggerimenti spesa, ottimizzazione faccende)
- `RESEND_API_KEY`: Per email transazionali (inviti famiglia, verifica account, reset password) via Resend
- `EMAIL_FROM`: Mittente email (default `noreply@familysync.eu`)
- `SUPPORT_EMAIL`: Indirizzo Reply-To per le risposte degli utenti (`assistenza@familysync.it`)
- `CLIENT_URL`: Base URL pubblica per i link nelle email (`https://familysync.eu`)

## Recenti Modifiche (Febbraio 2026)

- Implementato backend completo con autenticazione JWT multi-utente
- Creato database PostgreSQL con 19 tabelle via Drizzle ORM (incluse reports, blocks, recipes, recipe_ingredients, meal_plans, meal_plan_items)
- Aggiunto WebSocket per sincronizzazione real-time tra dispositivi
- Integrato OpenAI per suggerimenti AI su spesa e faccende
- Configurato Stripe per abbonamenti Premium (€4.99/mese o €39.99/anno)
- Aggiunta sicurezza con helmet e rate limiting
- Implementato sistema moderazione UGC completo:
  - Tabelle `reports` e `blocks` con enum per categorie e stati
  - API endpoints per segnalazione contenuti/utenti, blocco/sblocco utenti
  - Block enforcement: contenuti utenti bloccati filtrati da calendar/shopping/chores
  - AI guard middleware: funzionalità AI controllata da toggle utente (GDPR consent)
  - Frontend: toggle AI nelle impostazioni, modal report, lista utenti bloccati, pannello admin segnalazioni
- Aggiornati Privacy Policy (sezione AI dettagliata) e Termini d'Uso (sezione UGC/moderazione)
- Implementato sistema guida utente completo:
  - File markdown `/docs/guida-utente.md` con documentazione completa in italiano
  - Backend route pubblica `GET /help/user-guide` che serve HTML styled (no auth richiesta)
  - Frontend screen `app/help/user-guide.tsx` con contenuto nativo React Native
  - Link "Guida Utente" aggiunto nella sezione Legale della scheda Famiglia
  - Route `/help` aggiunta come gruppo pubblico in AuthGate (accessibile senza login)
- Implementato ecosistema completo Ricette & Meal Planning:
  - Schema DB: 4 nuove tabelle (recipes, recipe_ingredients, meal_plans, meal_plan_items) con 3 enums
  - Backend CRUD: POST/GET/DELETE ricette, POST/GET/DELETE meal plans, conversione piano a lista spesa
  - AI endpoints: generazione suggerimenti ricette, generazione piano pasti settimanale
  - Frontend: schermate ricette (lista + dettaglio), piano pasti (gestione + generazione AI)
  - Quick-access cards nella home per Ricette e Piano Pasti
  - Ingredienti con unita italiane, meal types con labels italiani
- Implementato sistema Chat/Messaggi interni in tempo reale:
  - Tabella `chat_messages` con supporto testo, immagini e file
  - Backend API: GET/POST/DELETE messaggi, POST upload file con multer
  - WebSocket events: new_message, message_deleted, typing, stop_typing
  - Frontend: schermata chat con bolle stile messenger, upload immagini da galleria/fotocamera
  - Block filtering applicato ai messaggi chat
  - Tab Chat aggiunto alla navigazione principale (6 tab totali)
  - File statici serviti da `/uploads` con limite 10MB e filtri MIME type

## Recenti Modifiche (Luglio 2026)

- Implementato input vocale nelle schermate AI (per la versione 1.0.2):
  - Backend: rotta `POST /api/ai/:familyId/transcribe` (multer in memoria, max 10MB, allowlist MIME + verifica magic-bytes audio), trascrizione via OpenAI `gpt-4o-mini-transcribe` (lingua it), quota giornaliera `voice-transcription` (free 5/giorno, premium 30/giorno)
  - Frontend: `components/VoiceInput.tsx` con `VoiceInput` (dettatura via expo-audio, lock globale un-solo-mic, cleanup su unmount) e `SpeakButton` (lettura ad alta voce via expo-speech it-IT, chunking testi lunghi)
  - Integrazioni: mic nella ricerca ricette, mic sui campi dieta/allergie del piano pasti; altoparlante su piano generato, anteprima ricetta AI e dettaglio ricetta
  - `app.json`: plugin expo-audio con messaggio permesso microfono in italiano
- Migliorata UX input vocale (feedback utente):
  - VoiceInput ora è "tieni premuto per parlare" (premi → parli → rilasci); tocco breve <400ms mostra un suggerimento d'uso; su web listener globali pointerup/blur evitano registrazioni bloccate
  - Nella ricerca ricette la dettatura avvia automaticamente la ricerca AI e i risultati vengono letti ad alta voce (titolo + descrizione), incluso il caso "nessuna ricetta trovata"
  - Nuovo helper `speakText()` in components/VoiceInput.tsx; SpeakButton interrompe eventuali letture in corso prima di parlare
  - La copia statica `web-build` va rigenerata (`npx expo export --platform web`) dopo ogni modifica frontend rilevante, altrimenti alcune anteprime mostrano la versione vecchia
- Implementato "Detta e genera" nel Piano Pasti (dettatura unica + lettura ad alta voce):
  - Backend: `generateWeeklyMealPlan` accetta `preferences.notes` (testo libero dettato, trim + max 600 caratteri) iniettato nel prompt come "Preferenze della famiglia (dettate a voce)"
  - Frontend (app/meal-plans/index.tsx): card "Detta e genera" nel tab Genera con un UNICO microfono hold-to-talk; l'utente detta dieta/allergie/preferenze in una volta, al rilascio parte la generazione e il piano viene letto ad alta voce (`buildPlanSpeech` raggruppa per giorno con nomi italiani); anche gli errori vengono letti a voce
  - Rimossi i microfoni separati dai campi Dieta e Allergie (restano campi di testo); il testo dettato è mostrato in un box con X per cancellarlo e viene riusato anche per il Piano B alternativo
  - Protezioni concorrenza: guard `if (generating || generatingAlt) return` su entrambe le generazioni, mic disabilitato durante la generazione, contatore `streamSeqRef` che ignora aggiornamenti/letture di stream obsoleti
  - Niente foto per il piano pasti (solo per le ricette)
- Implementate FOTO delle ricette proposte dall'AI:
  - Backend: rotta `POST /api/ai/:familyId/recipe-image` genera la foto del piatto con gpt-image-1 (quality low), quota giornaliera `recipe-image` (free 10/g, premium 50/g in AI_DAILY_LIMITS)
  - Cache su disco in `uploads/recipe-images/<sha256(titolo normalizzato)>.webp`, condivisa tra famiglie (asset generici, nessun dato personale); cache-hit non consuma quota; dedup in-flight che condivide l'esito reale del leader coi follower
  - Ottimizzazione con sharp: resize 512px + WebP q80 (~35KB invece di ~1,5MB PNG), scrittura atomica tmp+rename
  - `/uploads/recipe-images` servito pubblico (maxAge 30d) montato PRIMA di `/uploads` autenticato; gli altri upload restano protetti
  - Colonna `image_url` su `recipes`; `/api/recipes/bulk` valida imageUrl con regex whitelist e ora richiede `requireFamilyMember()` (fix IDOR)
  - Frontend: `components/RecipeImage.tsx` (RecipeAiImage con expo-image, cache in-memory, generazione lazy, fallback icona); foto nelle card/modal di preview.tsx, in recipes/index.tsx e nel dettaglio [id].tsx; il salvataggio include imageUrl dalla cache
- Implementata sincronizzazione calendario con calendari esterni (due modalità):
  - Salvataggio nel calendario del telefono: `lib/device-calendar.ts` (expo-calendar ~15.0.8, plugin in app.json con permesso in italiano) — permessi, calendario scrivibile iOS/Android, gestione allDay/endTime (+1h default, giorno dopo se scavalca mezzanotte); icona download su ogni evento in `app/(tabs)/calendar.tsx` (solo native, su web rimanda al feed ICS)
  - Feed ICS pubblico per Google/Apple Calendar: colonna `families.ics_feed_token` (varchar 64 unique, migrazione `migrations/0002`), rotta autenticata `GET /api/calendar/:familyId/feed-url` (genera token randomBytes(24), `?regenerate=1` per revocare), rotta pubblica `GET /calendar-feed/:token(.ics)` in `server/routes/calendar-feed.ts` (formato RFC 5545: escaping, folding 75 ottetti, TZID Europe/Rome, VALUE=DATE per all-day, eventi da -90gg, Cache-Control 300s, 404 uniforme su token invalido)
  - Helper ICS esportati e testati (`server/__tests__/calendar-feed.test.ts`, node:test via `npx tsx`): `computeTimedEnd` garantisce DTEND mai prima di DTSTART (wrap notturno 23:30 → 00:30 giorno dopo)
  - Frontend: schermata `app/calendar-sync.tsx` (link feed con copia/condividi/rigenera + istruzioni Google/Apple in italiano), card "Sincronizza calendario" in `app/(tabs)/family.tsx`
