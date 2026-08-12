---
name: Social login (Google/Apple)
description: Convenzioni di sicurezza per il login social di FamilySync
---

Regole:
- Google usa il code-flow LATO SERVER (`/api/auth/google/start` → callback → redirect al client con `loginCode` monouso). I token di sessione non passano MAI nell'URL.
- Il `loginCode` è un JWT 2 min con `jti` consumato in-memory al primo `/oauth/complete`; il replay va rifiutato.
- `returnUrl` è validato con allow-list: `myapp://`, host noti (dev domain, CLIENT_URL, EXPO_PUBLIC_DOMAIN); `exp://` e `exps://` SOLO in sviluppo.
- Expo Go via tunnel ngrok: il deep link di ritorno DEVE essere `exps://` (non `exp://`), altrimenti Expo Go mostra "Something went wrong" al rientro; il client converte lo schema quando l'host contiene "ngrok". In più `openAuthSessionAsync` su Android può tornare "dismiss" anche a redirect avvenuto: serve il listener `Linking.addEventListener("url")` come fallback per catturare loginCode/signupToken.
- id_token Google e identityToken Apple vanno verificati con jose JWKS (firma, issuer, audience); rifiutare email non verificate prima del find-or-create per email.
- Audience Apple: bundle id `com.familysyncapp.coordinator` (prod); in dev anche `host.exp.Exponent` (Expo Go).
- Utenti social: `passwordHash` NULL + `authProvider`; login/change-password/delete-account devono gestire passwordHash null (codice `SOCIAL_LOGIN_ONLY`; delete senza password richiede comunque "ELIMINA").
- Secret client Google: `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`; senza di essi `/social-config` risponde `google:false` e il bottone resta ma il server dà 503.

**Why:** review di sicurezza ha bocciato la prima versione per open redirect via `exp://*`, loginCode replayabile e linking per email non verificata.
**How to apply:** qualsiasi nuovo provider social deve seguire lo stesso schema (code monouso + JWKS + allow-list returnUrl).

## Redirect URI in dev (porta obbligatoria)
Il dominio Replit dev SENZA porta (externalPort 80) punta a Metro/Expo web (8081), NON al backend: un callback OAuth senza `:5000` viene "servito" dalla SPA e l'utente torna al benvenuto senza errori. `getPublicBaseUrl()` in dev deve includere `:5000`, e l'URI `https://<REPLIT_DEV_DOMAIN>:5000/api/auth/google/callback` va registrato nella Google Cloud Console (match esatto, porta inclusa).
**Come diagnosticare:** nei log backend si vede `google/start 302` ma MAI `google/callback` → il callback finisce altrove (Metro o prod).

**AuthGate e rotte pubbliche (ago 2026):** la pagina di completamento registrazione social (`social-complete`) DEVE stare nel gruppo rotte pubbliche di AuthGate: il nuovo utente ci arriva NON autenticato (solo signupToken). Senza eccezione veniva rimbalzato su /welcome e il signup Google web falliva in prod. Regola generale: ogni nuova pagina raggiungibile prima del login va aggiunta a `inPublicGroup` in app/_layout.tsx.

## Callback Google duplicato (browser mobile)
Chrome Android / browser in-app possono chiamare /api/auth/google/callback DUE volte con lo stesso authorization code (~450ms di distanza): il secondo scambio fallisce con invalid_grant e l'utente vede "Errore durante l'accesso con Google".
**Fix:** claim atomico su tabella oauth_callback_results (hash di code+state, TTL 2 min): solo il vincitore scambia il code con Google, le duplicate attendono e ricevono lo stesso redirect. Cache-Control: no-store sul callback. Mai rimuovere il dedup: il problema è del browser, non riproducibile da desktop.
