---
name: Secure family invite flow
description: Conventions/constraints for FamilySync's email-link family invite (token-hash, one-time, atomicity)
---

# Flusso invito sicuro famiglia (FamilySync)

Sostituisce il vecchio "Aggiungi membro" (utente auto-creato + password temporanea a schermo, ora RIMOSSO insieme a `/members` e `/reset-access`).

## Invarianti da mantenere
- **Solo hash del token nel DB** (`family_invites.tokenHash`, sha256 via `server/lib/invite-token.ts`). Il token in chiaro vive solo nel link email; mai loggarlo né in dev né in prod.
- **Token monouso atomico**: il consumo (`acceptedAt`) e la creazione della membership devono stare nella STESSA `db.transaction`. Se l'insert membro fallisce, il claim del token va in rollback, altrimenti il token resta bruciato e l'utente escluso in modo irreversibile.
  - **Why:** senza transazione un fallimento post-claim lascia l'invitato senza via di rientro.
- **Invite endpoint ha un rate limiter DEDICATO** (`createInviteLimiter`, 20/15min in `families.ts`), oltre al limiter globale `/api` (100/15min) e a `inviteLimiter` (30/15min su `/api/invites`). Il globale è troppo largo per frenare spam/enumerazione email.
- **Produzione + SendGrid assente** → 503 `EMAIL_NOT_CONFIGURED` PRIMA di scrivere l'invito.
- **Produzione + invio email fallito** → rollback (delete) dell'invito + 502 `EMAIL_SEND_FAILED`. In dev l'invito resta e il link è incluso nella response per test manuale.
- **EMAIL_MISMATCH 403**: utente loggato che accetta via `/api/families/join/:token` deve avere email == invito.
- `/api/families` è dietro `authenticate + requireEmailVerified` (verifica letta dal DB). Quindi un utente registrato ma NON verificato non può usare `join`. Il path pubblico `/api/invites/:token/accept` è per chi NON ha ancora un account (crea utente `emailVerified=true` + auto-login); se l'email esiste già → 409 `USER_EXISTS`.

## How to apply
Qualsiasi modifica al flusso deve preservare: hash-only, transazionalità del consumo, rate limiter dedicato sull'invito, e i comportamenti prod email (503/502+rollback). Test: `npx tsx server/__tests__/invites.test.ts` (integration HTTP+DB, 9 casi).
