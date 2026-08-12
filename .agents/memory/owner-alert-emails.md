---
name: Alert email al proprietario
description: Regole per gli alert automatici via APP_OWNER_EMAILS (crash client, integrità upload, ecc.)
---

**Regola:** ogni contenuto fornito dal client che finisce in un'email al proprietario va sanificato come i log: `redactForLog` su messaggi/UA e URL ridotti a origin+path con i segmenti dopo `reset-password`/`verify-email`/`join`/`join-link` mascherati (i capability token vivono nel PATH, non solo in query).

**Why:** l'ErrorBoundary manda `window.location.href` intero; un crash su una pagina di reset/invito metterebbe il token nell'email e nella retention di Resend. Un completion review ha respinto due volte l'alert crash proprio per questo.

**How to apply:** per i CLIENT_CRASH esiste `sanitizeCrashSample` in server/lib/client-crash-alert.ts (finestra scorrevole in-memory + cooldown, env CLIENT_CRASH_ALERT_THRESHOLD/_WINDOW_MINUTES/_COOLDOWN_MINUTES). Nuovi canali di alert devono riusare lo stesso approccio prima di comporre l'email.
