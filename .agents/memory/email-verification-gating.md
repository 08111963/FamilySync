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

**Media token (implemented):** `/uploads` no longer accepts the normal access token. It uses a
dedicated media token — separate JWT secret (derived from JWT_SECRET so the two token types are not
interchangeable), `scope:'media'`, `userId`, optional `filePath`, 5-min TTL. Minted via
`POST /api/auth/media-token` (authenticate + requireEmailVerified). `authenticateMedia` accepts it
ONLY from `?token=`, rejects access tokens, enforces `scope==='media'`, and when `filePath` is set
binds the token to that single file (403 FORBIDDEN_FILE on mismatch). filePath is validated
(`/uploads/...` shape, no `..`) at mint time.

**Why per-file is not used for inline images:** a chat list with many images would need one token
request per image. Frontend (`hooks/useMediaToken.ts`) uses ONE shared session token (no filePath,
auto-refreshed every 4 min) for inline `<Image>`, and a per-file scoped token only for
download/open-in-browser presses where the extra request is cheap.

**Residual risk:** token still rides in the query string (log/referrer), but it's now a short-lived
(5-min) media-only token, not the API access token.
