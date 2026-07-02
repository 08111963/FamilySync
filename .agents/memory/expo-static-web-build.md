---
name: Static web-build staleness
description: The Express backend serves a static Expo web export from web-build/; it goes stale after frontend changes.
---

The backend (port 5000) serves a static Expo web export from `web-build/` alongside Metro dev (port 8081). Some previews/paths load the static copy, not Metro.

**Why:** After the voice-input feature shipped, the user could not see new UI while Metro/e2e tests showed it — the static `web-build` was weeks old. Cost hours of debugging (cache, layout, bundle checks) before finding it.

**How to apply:** After any user-visible frontend change, regenerate with `npx expo export --platform web --output-dir web-build-new`, verify the new bundle contains the new feature (grep a testID), swap directories, restart the backend. The export takes >2 min — run it backgrounded with output redirected (plain foreground bash call times out at 120s with no output).
