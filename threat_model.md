# Threat Model

## Project Overview

FamilySync is a family-coordination mobile-first application. The backend is Express.js (TypeScript) serving a RESTful API with `/api` prefix, Socket.io for real-time sync, and static hosting of an Expo web build. The frontend is Expo React Native (iOS, Android, and web). The app is publicly deployed at `https://familysync.eu` (Replit autoscale, multi-instance).

Key features: shared calendar, shopping lists, chores with gamification, bills, AI-generated suggestions, in-app chat (text/images/files), meal plans, RevenueCat premium subscriptions, and Google/Apple OAuth.

**Stack:** Node.js, Express v5, TypeScript, Drizzle ORM + PostgreSQL (Neon), JWT (access 15 min / refresh 7 days), bcrypt, Socket.io, OpenAI, RevenueCat, Resend (email), expo-router.

## Assets

- **User credentials** — email + bcrypt-hashed passwords, Google/Apple OAuth identities. Compromise allows account takeover and access to all family data.
- **JWT refresh tokens** — 7-day tokens stored on client. No server-side revocation store. Theft gives week-long persistent access.
- **Family data** — calendar events, shopping items, chores, bills, chat messages, meal plans, uploaded images/files. PII-sensitive; shared within a family group.
- **AI usage quota state** — per-user daily counters controlling paid AI features.
- **Premium entitlements** — RevenueCat subscription status controlling paid features; stored in DB and synced via webhook.
- **Application secrets** — `SESSION_SECRET` (JWT signing), `DATABASE_URL`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `REVENUECAT_WEBHOOK_AUTH_HEADER`.

## Trust Boundaries

- **Client ↔ API** — all requests are untrusted until validated by `authenticate` middleware. JWT carries `userId`; every data operation must re-verify ownership server-side.
- **API ↔ PostgreSQL** — Drizzle ORM with parameterized queries throughout; no raw string concatenation found.
- **API ↔ OpenAI** — server-side only; no user-controlled prompt passed without system-message sandboxing.
- **API ↔ RevenueCat webhook** — unauthenticated origin; protected by `REVENUECAT_WEBHOOK_AUTH_HEADER` secret compared with `Authorization` header.
- **Autoscale instances** — multiple stateless Node processes share only the database; any in-process state (Maps, caches) is NOT shared.
- **Public calendar feed** — `/api/calendar-feed/:token` is fully public; the 192-bit hex token is the only access control.

## Scan Anchors

**Production entry points:**
- `server/routes.ts` — route registration, Helmet, global rate limiter
- `server/index.ts` — server bootstrap, static file serving, Expo manifest handler
- `server/routes/auth.ts` — login, signup, refresh, OAuth, password reset, change-password
- `server/routes/families.ts`, `server/middleware/family.ts` — family membership enforcement
- `server/routes/chat.ts` — real-time messaging with file uploads
- `server/routes/ai.ts` — OpenAI integration with freemium quota
- `server/routes/purchases.ts` + `POST /api/purchases/webhook` — RevenueCat entitlements

**Highest-risk areas:**
- `server/lib/jwt.ts` — token signing/verification
- `server/lib/oauth.ts` — Google/Apple OAuth, in-process login-code replay store
- Any route where `familyId` is caller-supplied and the DB query must scope to that family

**Public surfaces:** `/`, `/help/user-guide`, `/api/health`, `/api/calendar-feed/:token`, `/api/invites/:token`, `/api/join-link/:code`
**Authenticated surfaces:** all `/api/*` except above
**Admin/owner surfaces:** `requireAppOwner` middleware checks against `APP_OWNER_EMAILS` env var

**Dev-only / ignore:** `scripts/`, `server_dist/` (compiled artifact, not the source), `__tests__/`

## Threat Categories

### Spoofing

JWT access tokens expire in 15 minutes; refresh tokens in 7 days. **No revocation mechanism exists** — stolen refresh tokens remain valid for 7 days even after a password change. The `/api/auth/refresh` endpoint checks only `deletedAt`; password-change at `/api/auth/change-password` does not touch tokens. The only termination path for a compromised session is full account deletion.

OAuth one-time login codes are protected by an in-process `Map` (`consumedLoginCodes` in `server/lib/oauth.ts`). On autoscale, multiple instances each maintain independent maps; a code consumed on instance A can be replayed on instance B within its 2-minute window.

**Guarantees required:**
- Password change MUST invalidate all outstanding refresh tokens (token-version column or token-store deletion).
- OAuth login-code replay protection MUST use shared state (DB or distributed cache).

### Tampering

`POST /api/join-link/:code/accept` accepts a caller-supplied `email` value and sets `emailVerified = true` without any email-ownership proof. This allows an attacker with any valid join-link to create accounts under arbitrary email addresses, blocking real owners from registering.

**Guarantees required:**
- New accounts created via join-link MUST send a verification email rather than auto-setting `emailVerified = true`.

### Information Disclosure

Multiple debug `console.log` statements emit email addresses and password-reset/verification links to stdout in non-production environments (`[DEV]` prefix). These are dev-only by design (gated on `!RESEND_API_KEY`), but stdout may be captured in Replit deployment logs. Severity is LOW for logs, but links in logs represent a token disclosure risk.

`EXPO_PUBLIC_REVENUECAT_API_KEY` and `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` appear in `.replit` — these are intentionally public mobile SDK keys and are not secrets.

### Elevation of Privilege

Two BOLA (IDOR) vulnerabilities exist where route middleware correctly verifies family membership but the DB mutation query lacks a `familyId` filter, allowing writes to cross-family objects:

1. `PATCH /api/moderation/reports/:familyId/:reportId` — WHERE clause filters only on `reportId`, not `familyId`. A family admin can update reports belonging to other families.
2. `PATCH /api/ai/:familyId/insights/:insightId/dismiss` — WHERE clause filters only on `insightId`. A family member can dismiss AI insights belonging to other families.

**Guarantees required:**
- Every UPDATE/DELETE query on a family-scoped resource MUST include `AND familyId = :familyId` in the WHERE clause, not just in middleware.

### Denial of Service

`POST /api/auth/login` has no dedicated rate limiter — only the shared global 100-req/15-min `/api` quota applies. No per-account lockout exists. Password brute force is constrained but not adequately throttled for a production login endpoint.

### Security Misconfiguration

`contentSecurityPolicy: false` in Helmet (`server/routes.ts`) disables CSP entirely for all responses including the browser-facing web app. No XSS-mitigation secondary control is present.

Calendar event data (title, description, location) is escaped for `\n` but not `\r` in `icsEscape()`. When ICS lines are joined with `\r\n`, a bare `\r` in user data creates a valid RFC 5545 line terminator, allowing property injection into public ICS calendar feeds.
