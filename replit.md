# FamilySync - App di Coordinamento Familiare

## Panoramica

FamilySync è un'applicazione mobile-first per il coordinamento familiare: frontend Expo React Native (iOS, Android e web) e backend Express.js. Aiuta le famiglie a gestire eventi calendario, liste della spesa, faccende, bollette, ricette/piani pasti e una chat interna.

L'app è pensata per essere production-ready per App Store e Google Play: interfaccia in italiano, feedback tattile, dark mode, offline-first.

## Preferenze Utente

- Stile di comunicazione preferito: linguaggio semplice e quotidiano.
- Lingua di comunicazione: rispondere SEMPRE in italiano.

## Architettura Sistema

### Frontend
- **Framework**: Expo SDK 54 con React Native 0.81
- **Routing**: expo-router v6 (file-based, typed routes)
- **Stato**: React Context (FamilyContext, AuthContext) + TanStack React Query (stato server) + AsyncStorage (persistenza locale, offline-first)
- **UI**: libreria componenti custom, StyleSheet con temi light/dark (`hooks/useColors`, `constants/colors.ts`)
- **Navigazione**: tab navigation (Home, Calendario, Spesa, Faccende, Bollette, Chat, Famiglia)

### Backend
- **Framework**: Express.js v5 in TypeScript (tsx in dev)
- **API**: RESTful con prefisso `/api`
- **DB**: Drizzle ORM su PostgreSQL; validazione con Zod + drizzle-zod
- **Auth**: JWT (access token 15 min, refresh token 7 giorni)
- **Real-time**: Socket.io per sincronizzazione tra dispositivi
- **AI**: OpenAI per suggerimenti (spesa, faccende, ricette, trascrizione vocale)
- **Pagamenti**: RevenueCat (sorgente di verità per Premium); Stripe presente ma dormiente

### Storage
- **DB principale**: PostgreSQL (Neon) via `DATABASE_URL`
- **Schema**: `shared/schema.ts` (Drizzle); migrazioni in `./migrations` (Drizzle Kit)
- **Locale**: AsyncStorage per caching offline-first

### Struttura Progetto
```
├── app/            # Expo Router (schermate, tabs, modali)
├── components/     # Componenti UI riutilizzabili
├── constants/      # Colori tema e costanti
├── context/        # React Context providers
├── hooks/          # Custom hooks
├── lib/            # Utility (query-client, revenuecat, device-calendar, ...)
├── scripts/        # Script utility (seed)
├── server/         # Backend Express (index, routes/, lib/, middleware/)
├── shared/         # schema.ts condiviso frontend/backend
└── docs/           # Documentazione utente (guida-utente.md)
```

## Database e API

### Tabelle principali (~19)
users, families, family_members, family_invites, calendar_events, shopping_lists, shopping_items, chores, chore_completions, bills, ai_insights, refresh_tokens, verification_tokens, password_reset_tokens, reports, blocks, recipes, recipe_ingredients, meal_plans, meal_plan_items, chat_messages.

### API Routes
- `/api/auth` - registrazione, login, refresh, verifica email, reset password
- `/api/families` - CRUD famiglie, inviti membri
- `/api/calendar` - eventi calendario + feed ICS (`/calendar-feed/:token`)
- `/api/shopping` - liste e items spesa
- `/api/chores` - faccende con punti e classifiche
- `/api/bills` - bollette con stati e promemoria
- `/api/recipes`, `/api/*/meal-plans` - ricette e piani pasti
- `/api/ai` - suggerimenti AI + trascrizione vocale + foto ricette
- `/api/purchases` - sync entitlements RevenueCat
- `/api/moderation` - segnalazioni, blocchi, preferenze AI (GDPR)
- `/help/user-guide` - guida utente pubblica (HTML)

## Funzionalità Principali

- **Autenticazione multi-utente** JWT con verifica email e reset password
- **Calendario condiviso** con sync verso calendario del telefono (expo-calendar) e feed ICS pubblico per Google/Apple Calendar
- **Liste della spesa** condivise
- **Faccende** con gamification (punti, classifiche) e sync scadenze → calendario
- **Bollette** con stati (scadute/da pagare/pagate), promemoria locali e sync scadenze → calendario
- **Ricette & Piani pasti**: creazione manuale + generazione AI, foto piatti AI, conversione piano → lista spesa
- **Chat interna** in tempo reale (testo, immagini, file) via WebSocket
- **Input vocale** (dettatura + lettura ad alta voce) nelle schermate AI, eventi, faccende, chat
- **AI** con freemium a quota giornaliera e toggle consenso GDPR
- **Premium** (RevenueCat): abbonamenti mensili/annuali con gating lato server
- **Moderazione UGC**: segnalazioni, blocco utenti, filtro contenuti
- **Sicurezza**: helmet, rate limiting, block enforcement

## Dipendenze Esterne

- **PostgreSQL (Neon)** + **Drizzle ORM**
- **Expo SDK**, **Express.js**, **TanStack React Query**, **Socket.io**
- **bcryptjs**, **jsonwebtoken** (auth)
- **RevenueCat** (pagamenti); **Stripe** (dormiente)
- **OpenAI** (AI); **Resend** (email transazionali)
- UI: `@expo-google-fonts/inter`, `@expo/vector-icons`, `expo-haptics`, `expo-linear-gradient`

## Variabili Ambiente

### Richieste
- `DATABASE_URL` - connection string PostgreSQL
- `SESSION_SECRET` - secret per JWT signing (i secret JWT per-scopo derivano da qui se non impostati)
- `EXPO_PUBLIC_DOMAIN` - dominio pubblico per le richieste API
- `REPLIT_DEV_DOMAIN` - dominio sviluppo (Replit)

### Opzionali
- `OPENAI_API_KEY` - funzionalità AI
- `RESEND_API_KEY` - email transazionali via Resend
- `EMAIL_FROM` - mittente email (default `noreply@familysync.eu`, dominio verificato)
- `SUPPORT_EMAIL` - Reply-To (`assistenza@familysync.it`)
- `CLIENT_URL` - base URL per i link nelle email (`https://familysync.eu`)

## Note Operative

- **Web build statica**: il backend serve un export Expo web da `web-build/`; va rigenerato dopo modifiche frontend rilevanti (`npx expo export --platform web`).
- **Migrazioni produzione**: dopo il deploy applicare le migrazioni Drizzle al DB di produzione (dev e prod sono separati).
- **Log innocui in Expo Go**: avvisi expo-notifications, require cycle FamilyContext↔revenuecat, "WebSocket Invalid token" su web.
