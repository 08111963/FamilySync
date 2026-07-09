---
name: Expo dev connectivity (exps:// scheme)
description: Why Replit "Simulate on Android/iOS" + Expo Go QR fail with "Packager is not running", and the patch-package fix.
---

On Replit, dev domains are HTTPS-only (external port 80/http is refused; only 443 works). Expo Go connects via a deep link: `exp://` = insecure http, `exps://` = secure https. If the QR/preview advertises `exp://`, the phone gets "Packager is not running at http://…janeway.replit.dev".

**Root cause (Expo SDK 54 bug):** `@expo/cli` `getUrlComponentsFromProxyUrl` (in `.../start/server/UrlCreator.js`) upgrades the scheme `http`→`https` when `EXPO_PACKAGER_PROXY_URL` is https, but does NOT upgrade `exp`→`exps`. So the Expo Go deep link stays insecure `exp://` even behind the https proxy. This makes Replit's native device preview + QR fail.

**Fix:** patch-package patch adding an `exp`→`exps` branch alongside the existing `http`→`https` branch. After the fix Metro logs `› Metro waiting on exps://…` and the native tools reconnect.

**Why:** the scheme is what Replit's preview/QR inherit; fixing it at the CLI source fixes all native surfaces at once. Editing the `--localhost` flag or `EXPO_PACKAGER_PROXY_URL` does NOT change the deep-link scheme.

**How to apply:**
- Patch lives in `patches/` (project already runs `patch-package` in `postinstall`).
- `@expo/cli` is NESTED under `node_modules/expo/node_modules/@expo/cli`, so `npx patch-package @expo/cli` (makePatch) CRASHES (MODULE_NOT_FOUND in getPackageVCSDetails). Create the patch FILE by hand instead.
- Nested patch filename convention: `expo++@expo+cli+<version>.patch` (`++` separates nested pkgs, `+` for scope/version). The diff MUST use full project-root paths `a/node_modules/expo/node_modules/@expo/cli/build/src/...` and NO `index` line (mirror the existing `expo-asset` patch format). Verify with `npx patch-package` (apply mode) → expect `expo/@expo/cli@<ver> ✔`.
- Do NOT edit package.json scripts for this (removing `--localhost` had no effect).

**Tunnel is NOT a viable fallback here:** `npx expo start --tunnel` fails with ngrok error `Cannot read properties of undefined (reading 'body')` in this environment.

## Android Expo Go QR fails while iOS works — the interstitial "loading" page

Symptom: after the exps:// fix, iOS "Simulate"/Camera QR work but **Android Expo Go QR** (and Replit "Simulate on Android") still show "Packager is not running at http://…". Manifest AND bundle both serve fine over https (curl 200) — so the packager is healthy; the problem is what the QR encodes.

**Root cause:** when `expo-dev-client` is installed, `@expo/cli` enables the interstitial redirect page (`isRedirectPageEnabled()` true). Then `printDevServerInfo` sets the QR to `interstitialPageUrl ?? nativeRuntimeUrl` = `https://HOST/_expo/loading?platform=…` (an HTML disambiguation page), NOT the direct `exps://` deep link.
- iOS: you scan with the **Camera app**, which opens the https loading page in Safari → tap → launches Expo Go. Works.
- Android: you scan with **Expo Go's own scanner**, which treats the scanned https URL as a dev-server/manifest URL, fetches `/_expo/loading`, gets HTML instead of a manifest → "Packager is not running". Breaks.

**Fix:** set env `EXPO_NO_REDIRECT_PAGE=1` (development scope) so `getRedirectUrl()` returns null and the QR encodes the direct `exps://HOST` deep link again ("classic" behaviour). iOS Camera also opens `exps://` fine, so both platforms work. Confirm: Metro log no longer prints the "Choose an app to open your project at …" line.

**Why env var, not package.json:** the expo skill forbids editing package.json; reconfiguring the workflow risks the 8081→80 port mapping. A dev-scoped env var is picked up by `npm run expo:dev` and survives restarts.
