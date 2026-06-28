---
name: Web deployment (app on familysync.eu in browser)
description: How the production deployment serves the real Expo web app in a browser at the custom domain, instead of the Expo Go QR landing page.
---

# Serving the Expo web app at the custom domain

The app must be usable by opening `https://familysync.eu` in a phone browser (no Google Play, no Expo Go).

**Decision:** the production deploy builds an Expo **web export** and Express serves it.
- Deploy build command (set via `deployConfig`, NOT by editing `.replit` directly — direct edits are blocked): runs `npx expo export --platform web --output-dir web-build` then `npm run server:build`. This **replaced** the old `expo:static:build` (which only produced iOS/Android Expo Go bundles + a QR landing page and never built web).
- `app.json` `web` needs `"bundler": "metro"` + `"output": "single"` (SPA) for expo-router client routing.
- `@expo/metro-runtime` is NOT required — `expo export --platform web` succeeds without it (web already bundled fine in dev too).

**Why:** the prior deployment was an "Expo Go static" deploy; browsers got the QR/preview page, never the app. The app already runs on web in dev, so only the production serving was missing.

**How Express serves it (server/index.ts):**
- `configureExpoAndLanding` runs BEFORE `registerRoutes`, so the SPA catch-all must NOT live there or it would swallow `/api`, `/help`, `/uploads`.
- Manifest middleware still answers `/` and `/manifest` ONLY when header `expo-platform: ios|android` (keeps Expo Go working); landing page is served only when `web-build/index.html` is absent (fallback).
- `express.static(web-build)` serves `/` (index.html) + `/_expo/...` assets.
- `setupWebAppFallback(app)` is registered AFTER `registerRoutes`, before the error handler: for GET requests not starting with `/api` or `/uploads`, it `sendFile(web-build/index.html)` → enables deep links like `/calendario`.

**EXPO_PUBLIC_DOMAIN:** baked into the web bundle at export time (EXPO_PUBLIC_* are inlined). Build sets it to `familysync.eu` so the browser app calls same-origin `/api`. It is also in `[userenv.production]`.

**Re-export needed:** any frontend change requires re-running the web export to refresh `web-build`. The deploy build does this automatically on each publish; for local testing run the export manually.
