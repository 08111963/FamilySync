---
name: Auth token security conventions
description: Session revocation via tokenVersion, DB-backed OAuth code consumption, per-email login limiter, join-link email verification.
---

- **tokenVersion revocation**: `users.token_version` is embedded in refresh tokens and compared on `/api/auth/refresh`. Any password change/reset MUST increment it (`sql\`token_version + 1\``) to revoke old refresh tokens. Missing claim = version 0 (legacy tokens).
  **Why:** refresh tokens are stateless 7-day JWTs; without a version check a stolen token survives a password change.
  **How to apply:** any new flow that rotates credentials or adds logout must bump tokenVersion; change-password returns a fresh token pair that the client stores.
- **OAuth login-code monouso su DB**: consumed codes go in `consumed_oauth_codes` with atomic `INSERT … ON CONFLICT DO NOTHING` — never an in-memory Map (autoscale = multiple instances, replay across instances).
- **Login limiter per-email**: `/api/auth/login` has a dedicated limiter keyed on body email (fallback IP), 10/15min, skip in NODE_ENV=test. Don't rely only on the global /api limiter for auth brute force.
- **Join-link accounts are NOT email-verified**: any flow that accepts a caller-supplied email must create `emailVerified: false` + send verification email (signup pattern). Only flows that copy the email from a trusted record (DB invite, OAuth provider) may set true.
