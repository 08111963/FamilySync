---
name: Static web-build staleness
description: The Express backend serves a static Expo web export from web-build/; it goes stale after frontend changes.
---

The backend (port 5000) serves a static Expo web export from `web-build/` alongside Metro dev (port 8081). Some previews/paths load the static copy, not Metro.

**Why:** After the voice-input feature shipped, the user could not see new UI while Metro/e2e tests showed it — the static `web-build` was weeks old. Cost hours of debugging (cache, layout, bundle checks) before finding it.

**In-app signal:** in dev the web app now shows a dismissible "anteprima potrebbe essere vecchia" banner when `/build-version` reports `staleness.status === "stale"` (server gates it off in production/deploy). The "Nuova versione" update banner takes precedence over it. Staleness is computed once at server startup.

**How to apply:** After any user-visible frontend change, regenerate with `npx expo export --platform web --output-dir web-build-new`, verify the new bundle contains the new feature (grep a testID), swap directories, restart the backend. The export takes >2 min — run it backgrounded with output redirected (plain foreground bash call times out at 120s with no output).

**In-session regen works with Metro STOPPED:** with no Metro/Frontend workflow running, a backgrounded `CI=1 npx expo export --platform web --output-dir web-build-new` completes in ~100s. It can still die silently at "Starting Metro Bundler" even without Metro: verify with pgrep + grep for a new testID in the bundle, and retry once with `NODE_OPTIONS=--max-old-space-size=8192` before falling back to republish. The contention failure below applies when Metro 8081 is already running.

**Local export bakes NO domain:** without EXPO_PUBLIC_DOMAIN, `getApiUrl()`'s throw is inlined in the bundle ("EXPO_PUBLIC_DOMAIN is not set"). Playwright e2e tests (see `e2e/recipes-keyboard.test.ts`) work around it by intercepting `**/_expo/static/js/**` and rewriting the inlined throw to return the test base URL, plus stubbing all `**/api/**` routes — hermetic, no DB/AI.

**In-session regen is UNRELIABLE (Metro running):** background/detached `expo export` (nohup, setsid, even `script` PTY, with CI=1) consistently dies right after "Starting Metro Bundler" and produces no bundle — likely OOM in contention with the already-running Frontend Metro (8081). Foreground reaches ~78% then hits the 120s tool cap. Do NOT burn many attempts here. The Expo Launch / deploy pipeline rebuilds web-build in its own environment, so republishing is the reliable path to refresh the static/production surface.

**Canvas/preview port:** `.replit` maps localPort 8081 → externalPort 80 (Replit's PRIMARY web preview) = Metro LIVE. Port 5000 (externalPort 5000) is the Express backend serving the STALE static web-build. The screenshot/app_preview tool tends to hit 5000 (stale), which is NOT what the user's canvas "Mobile App" iframe shows (that's 8081, live). Don't conclude "user sees stale" from the screenshot tool alone.

## Icona PWA (manifest)
- `expo export --platform web` NON genera un web manifest: icona installazione = `public/manifest.json` + icon-192/512 + `<link rel="manifest">` patchato in `web-build/index.html` (patch da rifare a ogni export, come lang=it).
- Dopo la ripubblicazione l'utente deve rimuovere e ri-aggiungere l'app alla Home per aggiornare l'icona.

## Patch centralizzata
- `scripts/patch-web-build.sh <dir>` applica lang=it + link manifest PWA (idempotente); usarlo dopo OGNI export locale e già integrato nel build di deploy (.replit [deployment] via deployConfig).
- Il build di publish RI-ESPORTA web-build da zero: patch manuali su web-build vengono perse se non sono nello script.

## Cache Metro e EXPO_PUBLIC_DOMAIN
- `expo export` può riusare il bundle in cache Metro: se il primo export era senza EXPO_PUBLIC_DOMAIN, ri-esportare CON la env non basta — serve `expo export -c` per rigenerare col dominio baked. Verificare sempre con grep del dominio nel bundle.
