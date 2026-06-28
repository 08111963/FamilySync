---
name: Password reset conventions (FamilySync)
description: Security rules for the forgot/reset password flow — token hashing, single-use, anti-enumeration on every path.
---

# Password reset flow conventions

Mirror the secure invite-token pattern: store ONLY the SHA-256 hash of the reset
token in `passwordResetTokens.token`; the raw token lives only in the email link.
Reuse `server/lib/reset-token.ts` (generate/hash). No schema change needed — the
existing `token` varchar holds the 64-hex hash.

Single-use must be atomic: claim with `DELETE ... RETURNING` by token hash, then
check expiry on the returned row. No row → INVALID_TOKEN; expired row → TOKEN_EXPIRED.

**Anti-enumeration is the whole point — protect EVERY path, not just the lookup:**
- Identical generic 200 response whether the email exists or not.
- The email-send call must be wrapped in its own inner try/catch and STILL return
  the generic 200 on failure (just log server-side). If send failure returns 500
  for an existing user while a missing user gets 200, that difference is itself an
  enumeration side-channel. **Why:** this exact gap was caught in review.
- Only exception that may return non-200: production fail-closed
  `EMAIL_NOT_CONFIGURED`, checked BEFORE the DB lookup so it is independent of
  whether the email exists.

**Link-bearing emails (reset + verify) need MORE than SendGrid in prod:** the link
is built from `CLIENT_URL`, so SendGrid alone isn't enough — without `CLIENT_URL`
you'd send `undefined/reset-password/<token>`. Guard with
`isPasswordResetEmailConfigured()` / `isVerificationEmailConfigured()` (alias of
`isLinkEmailConfigured()` = SendGrid + CLIENT_URL + sender). **Why:** real bug — SendGrid set but CLIENT_URL missing shipped broken links.
- `server/lib/email.ts` reads env at RUNTIME (apiKey/clientBaseUrl/fromAddress
  functions, `sgMail.setApiKey` inside each send) — NOT at module load — so config
  helpers reflect live env and are deterministically testable.
- Family invite link uses `CLIENT_URL || config.getBaseUrl(req)` fallback, so it
  can't break and only needs the SendGrid-only `isEmailConfigured()` guard.
- Verify-email guards differ by intent: `/signup` is non-blocking in prod (skip
  send + log warning, user still created); `/resend-verification-email` is an
  explicit user action so it returns 503 when not fully configured.

Dedicated `rateLimit` on both `/request-password-reset` and `/reset-password`,
with `skip: () => process.env.NODE_ENV === 'test'` so the integration suite
(`server/__tests__/password.test.ts`) isn't throttled.

**How to apply:** when touching any auth endpoint that reacts to an email/identifier,
keep response shape + status identical across exist/not-exist/send-failure branches.
