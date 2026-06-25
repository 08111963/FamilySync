---
name: Email verification gating
description: How unverified-user blocking is enforced across all channels in this app (REST, static uploads, WebSocket)
---

# Email verification gating

Gating a feature behind `emailVerified` must cover **every** access channel, not just REST.
A reviewer-caught gap: the Socket.io handshake originally checked only the JWT, letting
unverified users still receive real-time chat events. There are three distinct surfaces:

- **REST API** — `requireEmailVerified` middleware applied at mount points in `server/routes.ts`.
- **Static `/uploads`** — served as static files, opened via `Linking.openURL` and plain `<Image>`
  which cannot send Authorization headers. Use a media-auth middleware that accepts the access
  token via `?token=` query param (fallback to Bearer header), then `requireEmailVerified`.
- **WebSocket** — the `io.use(...)` handshake middleware must also do the fresh DB lookup and reject
  unverified handshakes.

**Why:** the JWT payload only carries `{ userId, email }` — NOT `emailVerified`. So every guard must
query the DB fresh for the user's current `emailVerified`. Benefit: a user who just verified passes
immediately without needing to re-login / mint a new token.

**How to apply:** when adding any new authenticated surface (new route group, new socket namespace,
new static media path), gate it the same way. Keep the public allowlist limited to: auth, health,
legal/privacy/terms, help, resend-verification-email.

**Known tradeoff:** access token in `/uploads?token=` query string can leak via logs/referrer.
Acceptable short-term (15-min TTL, HTTPS). A dedicated short-lived signed media token would be safer.
