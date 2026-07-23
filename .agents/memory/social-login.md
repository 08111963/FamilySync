---
name: Social login (Google/Apple)
description: Convenzioni di sicurezza per il login social di FamilySync
---

Regole:
- Google usa il code-flow LATO SERVER (`/api/auth/google/start` → callback → redirect al client con `loginCode` monouso). I token di sessione non passano MAI nell'URL.
- Il `loginCode` è un JWT 2 min con `jti` consumato in-memory al primo `/oauth/complete`; il replay va rifiutato.
- `returnUrl` è validato con allow-list: `myapp://`, host noti (dev domain, CLIENT_URL, EXPO_PUBLIC_DOMAIN); `exp://` SOLO in sviluppo.
- id_token Google e identityToken Apple vanno verificati con jose JWKS (firma, issuer, audience); rifiutare email non verificate prima del find-or-create per email.
- Audience Apple: bundle id `com.familysyncapp.coordinator` (prod); in dev anche `host.exp.Exponent` (Expo Go).
- Utenti social: `passwordHash` NULL + `authProvider`; login/change-password/delete-account devono gestire passwordHash null (codice `SOCIAL_LOGIN_ONLY`; delete senza password richiede comunque "ELIMINA").
- Secret client Google: `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`; senza di essi `/social-config` risponde `google:false` e il bottone resta ma il server dà 503.

**Why:** review di sicurezza ha bocciato la prima versione per open redirect via `exp://*`, loginCode replayabile e linking per email non verificata.
**How to apply:** qualsiasi nuovo provider social deve seguire lo stesso schema (code monouso + JWKS + allow-list returnUrl).
