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

## HARD LIMIT: Android Expo Go can NOT connect to a physical device over the Replit https dev URL

Symptom persists even after exps:// + EXPO_NO_REDIRECT_PAGE: the Android bundle DOWNLOADS (splash + "downloading" shown) but then dies with fatal red "Packager is not running at http://HOST" (note: **http, no port**). iOS works, web works.

**Definitive root cause (verified):**
- React Native's Android native `PackagerStatusCheck.kt` hardcodes `PACKAGER_STATUS_URL_TEMPLATE = "http://%s/status"`. This runs INSIDE the Expo Go app on the phone — unpatchable from our repo. The `%s` is the manifest's `extra.expoGo.debuggerHost` = bare `HOST` (no scheme/port), so it always hits `http://HOST:80/status`.
- Replit dev domains: **port 80 (http) is CLOSED** — `nc`/curl to `HOST:80` = "Connection refused"; only 443 (https) is open. Verified from inside the container (172.24.0.5:80 refused).
- So Android's http-only status probe can never reach Replit's https-only server. iOS works because iOS native derives the packager scheme from the (https) bundle/manifest URL. The bundle itself downloads on Android because `bundleUrl` is explicit `https://…` — only the separate status probe is http-hardcoded.
- Setting `debuggerHost=HOST:443` would only make it `http://HOST:443` (plain http to a TLS port) → still fails. There is no manifest field that flips the native probe to https.

**The only real fix is a tunnel (ngrok) that serves plain http.** `@expo/ngrok` IS in package.json (so the original working setup almost certainly used `--tunnel`), BUT ngrok now fails with `ERR_NGROK_4018 "session is not authenticated"` — anonymous tunnels are dead. `--tunnel` cannot work until the user creates a free ngrok account and supplies an authtoken (then configure ngrok + switch the Start Frontend workflow command to run expo with `--tunnel`, NOT by editing package.json). The earlier vague "ngrok Cannot read properties of undefined (reading 'body')" was @expo/cli choking on this auth failure.

**Bottom line for the user:** on the Replit dev URL, physical-device Android Expo Go (and Replit "Simulate on Android", which uses the same probe) is fundamentally blocked without an authenticated tunnel. iPhone (Camera QR) and the browser work today. Do NOT keep tweaking Metro/QR/env — the blocker is native http vs Replit https, not the QR contents.
