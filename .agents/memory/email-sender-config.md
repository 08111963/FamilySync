---
name: Email sender (Resend) config
description: Why EMAIL_FROM uses the .eu domain while support is a .it address
---

# Email sender configuration (FamilySync / Resend)

Transactional emails are sent FROM `EMAIL_FROM=noreply@familysync.eu` with
`Reply-To = SUPPORT_EMAIL = assistenza@familysync.it`. Sender resolution lives in
`server/lib/email.ts` (fromAddress/supportAddress).

**Rule:** do NOT change `EMAIL_FROM` to `assistenza@familysync.it` until the
`familysync.it` domain is verified/authenticated (SPF/DKIM) in Resend.

**Why:** Resend only delivers from verified domains. `familysync.eu` is the
verified sending domain; `familysync.it` is the public contact/support/privacy
address shown in legal docs but is not (yet) a verified Resend sender. Switching
the From before verification makes all transactional email (verification,
invites, password reset, account-deletion confirmation) fail to send.

**How to apply:** keep From on the verified `.eu` domain; surface
`assistenza@familysync.it` only as Reply-To and as the contact email in
Privacy/Terms/delete-account pages.
