# Threat Model

## Project Overview

FamilySync is a family-coordination mobile-first application. The backend is Express.js (TypeScript) serving a RESTful API with `/api` prefix, Socket.io for real-time sync, and static hosting of an Expo web build. The frontend is Expo React Native (iOS, Android, and web). The app is publicly deployed at `https://familysync.eu` (Replit reserved_vm).

Key features: shared calendar, shopping lists, chores with gamification, bills, AI-generated suggestions, in-app chat (text/images/files), meal plans, RevenueCat premium subscriptions, Google Calendar OAuth sync, and Google/Apple login OAuth.

**Stack:** Node.js, Express v5, TypeScript, Drizzle ORM + PostgreSQL (Neon), JWT (access 15 min / refresh 7 days with `tokenVersion` revocation), bcrypt, Socket.io, OpenAI, RevenueCat, Resend (email), expo-router.

## Assets

- **User credentials** — email + bcrypt-hashed passwords, Google/Apple OAuth identities. Compromise allows account takeover and access to all family data.
- **JWT refresh tokens** — 7-day tokens. Revoked via `tokenVersion` increment on password change.
- **Family data** — calendar events, shopping items, chores, bills, chat messages, meal plans, uploaded images/files. PII-sensitive; shared within a family group.
- **AI usage quota state** — per-user daily counters controlling paid AI features.
- **Premium entitlements** — RevenueCat subscription status controlling paid features; stored in DB and synced via webhook.
- **Application secrets** — `SESSION_SECRET` (JWT signing), `DATABASE_URL`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `REVENUECAT_WEBHOOK_AUTH_HEADER`.

## Trust Boundaries

- **Client ↔ API** — all requests are untrusted until validated by `authenticate` middleware. JWT carries `userId`; every data operation must re-verify ownership server-side.
- **API ↔ PostgreSQL** — Drizzle ORM with parameterized queries throughout; no raw string concatenation found.
- **API ↔ OpenAI** — server-side only; no user-controlled prompt passed without system-message sandboxing.
- **API ↔ RevenueCat webhook** — protected by `REVENUECAT_WEBHOOK_AUTH_HEADER` secret compared with `Authorization` header; fail-closed in production (`NODE_ENV=production` always set via `npm run server:prod`).
- **Autoscale instances** — multiple stateless Node processes share only the database; OAuth login-code replay protection uses DB table `consumedOauthCodes` (fixed from in-process Map).
- **Public calendar feed** — `/calendar-feed/:token` is fully public; the 192-bit hex token is the only access control.
- **Child ↔ Parent boundary** — child (PIN-paired) accounts are issued JWTs with `isChildAccount: true`; `blockChildAccount` and `blockChildWrites` middleware gates sensitive routes. Several routes currently lack this guard (see Elevation of Privilege).

## Scan Anchors

**Production entry points:**
- `server/routes.ts` — route registration, Helmet (CSP enabled), global rate limiter
- `server/index.ts` — server bootstrap, static file serving, Expo manifest handler
- `server/routes/auth.ts` — login, signup, refresh, OAuth, password reset, change-password
- `server/routes/families.ts`, `server/middleware/family.ts` — family membership enforcement
- `server/routes/chat.ts` — real-time messaging with file uploads
- `server/routes/ai.ts` — OpenAI integration with freemium quota
- `server/routes/purchases.ts` + `POST /api/purchases/webhook` — RevenueCat entitlements
- `server/routes/google-calendar-sync.ts` — Google Calendar OAuth (separate from login OAuth)
- `server/routes/child-access.ts` — PIN pairing for child devices

**Highest-risk areas:**
- `server/lib/jwt.ts` — token signing/verification
- `server/lib/oauth.ts` — Google/Apple OAuth, DB-backed login-code replay protection
- `server/routes/chores.ts`, `server/routes/calendar.ts`, `server/routes/rewards.ts`, `server/routes/shopping.ts` — missing child-account guards on write endpoints
- `server/routes/expenses.ts` — missing per-record ownership check on PUT/DELETE

**Public surfaces:** `/`, `/help/user-guide`, `/api/health`, `/calendar-feed/:token`, `/api/invites/:token`, `/api/join-link/:code`
**Authenticated surfaces:** all `/api/*` except above
**Admin/owner surfaces:** `requireAppOwner` middleware checks against `APP_OWNER_EMAILS` env var

**Dev-only / ignore:** `scripts/`, `server_dist/` (compiled artifact), `__tests__/`

## Threat Categories

### Spoofing

JWT access tokens expire in 15 minutes; refresh tokens in 7 days. Password change now increments `tokenVersion`, immediately invalidating all outstanding refresh tokens (fixed). OAuth one-time login codes use a DB-backed `consumedOauthCodes` table shared across all autoscale instances (fixed from in-process Map).

**Current guarantees:** Password change DOES invalidate all outstanding refresh tokens. OAuth replay protection IS shared across instances.

### Tampering

`POST /api/join-link/:code/accept` correctly sets `emailVerified: false` and sends a verification email — the previously documented email squatting vulnerability has been fixed. All new accounts via join-link must verify their email before accessing `requireEmailVerified` endpoints.

Expenses: `PUT /api/expenses/:familyId/:expenseId` and `DELETE` lack a `memberId` ownership check — any family member can edit or delete another member's expense records. The WHERE clause only filters by `expenseId + familyId`, not by `createdBy`.

**Guarantees required:**
- Expense PUT/DELETE MUST add `AND memberId = <caller's membership ID>` to the WHERE clause.

### Information Disclosure

Multiple debug `console.log` statements emit email addresses in non-production environments (gated on `!RESEND_API_KEY`). These are dev-only by design; production always has `RESEND_API_KEY` configured.

Content Security Policy is now enabled via Helmet with appropriate directives (fixed from `contentSecurityPolicy: false`).

The public ICS calendar feed token grants broad read access to all family calendar events including descriptions and locations. Token is 192-bit random, so guessing is infeasible, but a leaked URL gives persistent family calendar access until manually regenerated.

### Elevation of Privilege

**Child account privilege escalation (active):** Four API routes are mounted without `blockChildAccount` or `blockChildWrites` middleware:
- `/api/chores` — child accounts can create high-value chores, self-complete them, and award arbitrary points to any family member. Critical to the gamification economy.
- `/api/calendar` — child accounts can create, modify, and delete family calendar events and regenerate the ICS token.
- `/api/rewards` — child accounts can redeem rewards without parental approval.
- `/api/shopping` — child accounts can delete all shopping lists and items.

Previously documented BOLA issues in moderation reports and AI insights have been fixed (WHERE clause now includes both resource ID and familyId).

**Guarantees required:**
- `/api/chores`, `/api/calendar`, `/api/rewards`, `/api/shopping` MUST apply `blockChildWrites` (or `blockChildAccount` where read access should also be restricted) at the mount level in `server/routes.ts`.

### Denial of Service

`POST /api/auth/login` has no dedicated rate limiter — only the shared global 100-req/15-min `/api` quota applies. No per-account lockout exists. Password brute force is constrained but not adequately throttled for a production login endpoint.

### Security Misconfiguration

Content Security Policy is now configured (fixed). The RevenueCat webhook handler uses a narrower production check (`process.env.NODE_ENV === 'production'`) vs `config.isProduction` used elsewhere — not currently exploitable since `server:prod` always sets `NODE_ENV=production`, but represents a latent code inconsistency.

Calendar ICS injection (CRLF): the `icsEscape()` function correctly escapes `\r`, `\n`, and `\r\n` (fixed from prior concern).
