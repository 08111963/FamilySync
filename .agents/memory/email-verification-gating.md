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

**File-level authorization (implemented):** a verified user must NOT be able to read any `/uploads`
file just because the path is well-formed. Authorization rule = "user is a member of the family that
owns the `chat_messages` row whose `file_url` references the file". There is no dedicated file→owner
metadata table; the chat_messages link IS the authority (every `/uploads` file is a chat attachment).
`server/lib/media-auth.ts#resolveUploadFileAccess(userId, fileUrlOrPath)` does the INNER JOIN
chat_messages × family_members and returns the familyId or null. Enforced in TWO places:
- mint (`POST /api/auth/media-token`): rejects (403) if user can't access the requested filePath /
  isn't a member of the requested familyId; token must be scoped to filePath OR familyId (no unscoped).
- access (`authenticateMedia`): LIVE re-check against the file's real owning family on every request,
  so a token survives membership revocation only until the next request. token.familyId (if set) must
  equal the file's real family.
**Why live access-time check matters:** it's the true enforcement — a "shared" family-scoped token
(used for inline chat images) can still only open files whose family the user currently belongs to,
closing the IDOR where one broad token opened every uploaded file.
**Known gap (not a bypass of the family rule):** media access is NOT block-aware — a blocked user
could still fetch a blocked peer's attachment by direct URL if they share a family. Add a block-filter
to resolveUploadFileAccess only if product requires it.

## File access vs block relationship (bidirectional decision)
- `resolveUploadFileAccess` (server/lib/media-auth.ts) now denies `/uploads` access when a block exists between requester and the chat message author, scoped to the family, in EITHER direction (helper `usersHaveBlockRelationship`).
- **Why bidirectional:** security-conservative + required test "B blocked A must also 403". Note the chat list filter (`block-filter.ts`) is ONE-directional (hides only authors the requester blocked). Consequence/known nuance: a message can stay visible in chat while its attachment returns 403 when the block is only inverse. Product decision pending if full UX consistency wanted.
- Block check runs only when `authorId !== requester` (one extra query). Applied at both mint (`POST /api/auth/media-token` filePath) and access (`authenticateMedia`).
