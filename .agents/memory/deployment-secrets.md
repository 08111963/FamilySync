---
name: Production deployment secrets (FamilySync)
description: Which secrets the prod deploy requires to boot, and the SESSION_SECRET fallback for JWT keys.
---

# Production deploy secret requirements

The production server (`npm run server:prod`) hard-fails at boot if its required
secrets are missing — the build then crash-loops and the deploy fails healthcheck
(status 500 / connection refused). Required at boot:

- `DATABASE_URL` (always)
- JWT signing keys: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_MEDIA_SECRET`

**Gotcha:** the production environment historically had only `SESSION_SECRET`
set — the dedicated `JWT_*` secrets were never configured in prod. A new build that
required them crash-looped.

**Resolution (in `server/lib/jwt.ts`):** `resolveSecret` falls back to deriving
each key from `SESSION_SECRET` via `sha256(SESSION_SECRET + ':' + purpose)` when the
dedicated env var is absent. Purposes are distinct (`access` / `refresh` / `media`)
so the three keys differ — a refresh token cannot be replayed as an access token.
Fail-closed only if BOTH the dedicated var AND `SESSION_SECRET` are missing in prod.

**Why distinct derivation, not reuse:** access and refresh JWTs share the same
payload shape `{userId, email}`; signing them with the same secret would let a
refresh token verify as an access token. Always keep per-purpose key separation.

**How to apply:** before publishing, confirm prod has `SESSION_SECRET` (or the
explicit `JWT_*` set). Changing the signing key invalidates existing sessions
(users re-login once) — acceptable on a one-off migration deploy.
