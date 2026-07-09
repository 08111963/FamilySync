---
name: Static web-build staleness
description: The Express backend serves a static Expo web export from web-build/; it goes stale after frontend changes.
---

The backend (port 5000) serves a static Expo web export from `web-build/` alongside Metro dev (port 8081). Some previews/paths load the static copy, not Metro.

**Why:** After the voice-input feature shipped, the user could not see new UI while Metro/e2e tests showed it — the static `web-build` was weeks old. Cost hours of debugging (cache, layout, bundle checks) before finding it.

**How to apply:** After any user-visible frontend change, regenerate with `npx expo export --platform web --output-dir web-build-new`, verify the new bundle contains the new feature (grep a testID), swap directories, restart the backend. The export takes >2 min — run it backgrounded with output redirected (plain foreground bash call times out at 120s with no output).

**In-session regen is UNRELIABLE:** background/detached `expo export` (nohup, setsid, even `script` PTY, with CI=1) consistently dies right after "Starting Metro Bundler" and produces no bundle — likely OOM in contention with the already-running Frontend Metro (8081). Foreground reaches ~78% then hits the 120s tool cap. Do NOT burn many attempts here. The Expo Launch / deploy pipeline rebuilds web-build in its own environment, so republishing is the reliable path to refresh the static/production surface.

**Canvas/preview port:** `.replit` maps localPort 8081 → externalPort 80 (Replit's PRIMARY web preview) = Metro LIVE. Port 5000 (externalPort 5000) is the Express backend serving the STALE static web-build. The screenshot/app_preview tool tends to hit 5000 (stale), which is NOT what the user's canvas "Mobile App" iframe shows (that's 8081, live). Don't conclude "user sees stale" from the screenshot tool alone.
