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
- **Produzione + invio email fallito** → rollback (delete) dell'invito + 502 `EMAIL_SEND_FAILED`. In dev l'invito resta.
- **Chi può invitare = QUALSIASI membro** (scelta prodotto dell'utente): entrambe le rotte `POST /:familyId/invite` (email) e `POST /:familyId/invite-link` (WhatsApp/QR) usano `requireFamilyMember()`, NON più `requireFamilyAdmin()`. Il pulsante "Aggiungi" in `app/(tabs)/family.tsx` era già aperto a tutti.
- **Anti-escalation sul path email**: solo un admin può assegnare `role="admin"`. Un non-admin che invia `role=admin` viene forzato a `adult` lato server (`effectiveRole` da `req.membership.role` in `families.ts`); la UI `add-member.tsx` nasconde l'opzione Admin ai non-admin (`availableRoles`/`currentFamily.myRole`). **Why:** aprire gli inviti a tutti senza questo guard permetterebbe a un membro qualsiasi di crearsi un account admin (broken access control). L'autorità è SEMPRE server-side.
- **`inviteLink` restituito SEMPRE nella response di `POST /:familyId/invite`** (non più solo dev): serve alla UI per condivisione multi-canale (QR code + deep link WhatsApp `wa.me` + copia via expo-clipboard) OLTRE all'email. Il token vive solo in memoria/response (DB ha solo l'hash). Nota: il path pubblico nuovo-utente `/api/invites/:token/accept` si fida della sola segretezza del token (nessun email-match), rischio residuo più rilevante ora che il link gira anche su WhatsApp/QR.
- **EMAIL_MISMATCH 403**: utente loggato che accetta via `/api/families/join/:token` deve avere email == invito.
- `/api/families` è dietro `authenticate + requireEmailVerified` (verifica letta dal DB). Quindi un utente registrato ma NON verificato non può usare `join`. Il path pubblico `/api/invites/:token/accept` è per chi NON ha ancora un account (crea utente `emailVerified=true` + auto-login); se l'email esiste già → 409 `USER_EXISTS`.

## Link RIUTILIZZABILE (opzione 1: unico link/QR per famiglia)
Coesiste col flusso email-bound sopra. `families.inviteCode` (plaintext, unique) = codice riutilizzabile multi-uso fino al limite piano.
- **Ruolo joiner SEMPRE `adult`** (anti-escalation): sia nuovo utente (`server/routes/join-link.ts`) sia loggato (`/api/families/join-link/:code`). Mai fidarsi di role dal client.
- **Route pubbliche montate PRIMA di /api/families autenticate** in `server/routes.ts` (`GET /api/join-link/:code` stato valid|full|not_found; `POST /api/join-link/:code/accept` crea utente+membership); rate limiter dedicato `joinLinkLimiter`.
- **Limite membri atomico** via `isFamilyMemberLimitReachedTx` DENTRO la transaction, in entrambi i path.
- **Dedup membership è garantito dal DB**: vincolo `unique(family_id, user_id)` su `family_members` (`family_members_family_user_unique`). Il check pre-tx è best-effort; sotto race intercettare Postgres `23505` e restituire `ALREADY_MEMBER`. **Why:** richieste concorrenti dello stesso utente superano il check applicativo → serve il vincolo DB come garanzia finale.
- **Tradeoff noto accettato dall'utente**: il path pubblico nuovo-utente crea account con `emailVerified=true` su email AUTO-INSERITA (nessuna prova di possesso), necessario per la bassa frizione (le /api richiedono email verificata). Rischio squatting/impersonazione email (peggiore dell'email-bound perché l'email la sceglie l'invitato). Se in futuro si vuole chiudere: OTP/magic-link prima di attivare la membership.

## How to apply
Qualsiasi modifica al flusso deve preservare: hash-only, transazionalità del consumo, rate limiter dedicato sull'invito, e i comportamenti prod email (503/502+rollback). Per il link riutilizzabile: ruolo forzato adult, limite atomico in tx, dedup via vincolo DB + gestione 23505. Test: `npx tsx server/__tests__/invites.test.ts` (integration HTTP+DB, 9 casi).

## Link di invito consapevoli dell'ambiente (dev vs prod)
I link di invito (email `/join/:token` E riutilizzabile `/join-link/:code`) NON devono cablare `CLIENT_URL`: causa "link non valido" quando l'invito è generato da Expo Go (backend/DB dev) ma il link apre familysync.eu (prod), che non ha quel codice.
Usa `config.getInviteBaseUrl(req)`: in prod -> `CLIENT_URL` (dominio stabile); in dev -> host dev attendibile (`REPLIT_DEV_DOMAIN`, con porta, altrimenti fallback `https://$REPLIT_DEV_DOMAIN:5000` che serve la web-build). In dev il frontend parla col backend via `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000`.
**Why:** dev e prod hanno DB separati; il codice invito vive solo dove è stato creato. **How to apply:** ogni nuovo generatore di link invito passa da getInviteBaseUrl(req), mai da process.env.CLIENT_URL diretto.
