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
- `SENDGRID_API_KEY`: Per email transazionali (verifica, reset password)

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
