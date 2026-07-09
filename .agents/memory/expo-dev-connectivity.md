---
name: Expo dev connectivity (exps:// scheme)
description: Why Replit "Simulate on Android/iOS" + Expo Go QR fail with "Packager is not running", and the patch-package fix.
---

## ✅ ANDROID SOLVED: modern ngrok v3 tunnel — the working fix

Real Android Expo Go over the Replit https-only edge is fixed by tunneling Metro through **ngrok v3** (NOT expo's built-in `--tunnel`).

**Why expo's `--tunnel` fails and v3 standalone works:**
- `expo start --tunnel` uses `@expo/ngrok` → `@expo/ngrok-bin@2.3.42` (ancient ngrok **v2** client) + requests an `exp.direct` hostname that only expo's shared ngrok account can create. With a user's free token it throws the vague `Cannot read properties of undefined (reading 'body')` (wrapper choking on the failed connect). Do NOT chase this path.
- The DNS "can't resolve external" note below is STALE — `dns.lookup('tunnel.ngrok.com')` resolves fine; external connectivity works.

**The working setup (in repo):**
- `scripts/expo-tunnel.sh` (workflow `Start Frontend` runs `bash scripts/expo-tunnel.sh` — set via `configureWorkflow`, NOT by editing `.replit`/package.json which are both blocked).
- Downloads the official **ngrok v3** binary to `node_modules/.cache/ngrok/ngrok` (git-ignored, Metro-ignored, persists across restarts, re-downloads only after npm install). ngrok v3 auto-reads `NGROK_AUTHTOKEN` from env (a user-supplied secret; free account is enough).
- Starts `ngrok http 8081`, reads the assigned `https://<random>.ngrok-free.dev` from the local API `http://127.0.0.1:4040/api/tunnels`, then exports `EXPO_PACKAGER_PROXY_URL=<url>` + `REACT_NATIVE_PACKAGER_HOSTNAME=<host>` and `exec npx expo start --localhost`.
- Result: Metro QR becomes `exps://<host>.ngrok-free.dev` (via the exp→exps patch). Manifest + ~15.8MB JS bundle pass through the tunnel for android okhttp requests (HTTP 200); ngrok serves the http status probe too (http→307→https, okhttp follows).

**Why web preview stays unaffected:** the Replit preview/Canvas iframe loads via the Replit domain (8081→externalPort 80), NOT through ngrok, so the ngrok-free browser interstitial (which only triggers on browser User-Agents) never touches it. Native Expo Go requests (okhttp UA) bypass the interstitial → 200.

**Caveats:** the ngrok-free URL is RANDOM and changes every restart — the user must re-scan the QR from the Replit preview panel after each frontend restart. Free tier has bandwidth/rate limits (fine for occasional testing). Scan the QR from the Replit PREVIEW PANEL, be on updated Expo Go.

**Do NOT revert to the old conclusion that "Android is a platform issue / needs expo --tunnel".** ngrok v3 standalone is the fix.

---

## (Historical / superseded background below)

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

**CORRECTION (do not over-trust the http-status-probe theory):** Official Replit docs state the standard Expo template works on real Android phones via Expo Go with this SAME architecture (8081→externalPort 80, https-only, debuggerHost = bare host, no port). Our dev server matches it and is healthy (manifest OK, bundle url https, /status 200 over https). The earlier "port 80 closed → Android impossible" was proven only against the INTERNAL container IP (172.24.0.5:80), which is NOT the phone's path — the public edge almost certainly redirects/serves http→https for okhttp. So do NOT tell the user Android is fundamentally impossible without ngrok.

**DECISIVE public-edge test (do this, not internal curl):** external fetch (webFetch via web-search skill, which egresses through the public internet like the phone) of BOTH `https://HOST/status` AND `http://HOST/status` returns `packager-status:running`. So Replit's public edge serves the Android http port-80 probe fine — the status probe is NOT the blocker. This kills the "port 80 closed" theory (that was only the internal 172.24.0.5 IP).

**EXPO_NO_REDIRECT_PAGE is a no-op for the QR here:** removing it (deleteEnvVars development scope + workflow restart, confirmed gone from /proc/<pid>/environ) left the QR as `exps://HOST` and the browser root still renders the web app. It does NOT bring back an interstitial QR. Don't chase it as an Android fix.

**DECISIVE PROOF the app-side is fine for Android (2026-07-09):** requesting the dev server with `expo-platform: android` (vs ios) returns identical healthy results on BOTH Metro-direct (localhost:8081) AND the public https edge: manifest = HTTP 200 `application/expo+json` valid JSON w/ `runtimeVersion exposdk:54.0.0`; JS bundle (`/node_modules/expo-router/entry.bundle?platform=android...`) = HTTP 200 `application/javascript` ~15.6MB, structurally identical to the ios bundle. So Metro serves, compiles, and delivers the Android app correctly over the public internet. When iOS+browser work but BOTH Android paths (Replit emulator + phone QR) fail against this, the block is 100% Android-CLIENT-side (Expo Go app SDK-54 support / phone network / Replit Android emulator), NOT the repo. Reverted the console-QR patch to the exps://HOST form (known iOS-good); exp://HOST:80 did NOT unstick Android. Replit's OWN docs (references/troubleshooting/mobile-app) prescribe `--tunnel` for restricted-network Android — the real remaining fix — plus: update Expo Go on the phone, scan the QR from the Replit PREVIEW PANEL (not the CLI console), be on Wi-Fi. Do NOT keep churning code past this proof.

**Conclusion when app-side is exhausted:** if server+manifest+public-edge(http&https)+debuggerHost all healthy and match the official template, iOS+browser work, user is on a PAID plan (emulator available) with unchanged config, and Android (both emulator AND phone QR) still fails — the remaining layer is Replit platform Android connectivity / Expo Go app, i.e. a platform issue for Replit Support, not a code fix.

**QR content is HARDCODED by Expo CLI (no env toggle):** for Expo Go the console QR = `getRedirectUrl() ?? getNativeRuntimeUrl()`. `getRedirectUrl()` (the `/_expo/loading` interstitial handoff) is null unless `expo-dev-client` is installed AND `!EXPO_NO_REDIRECT_PAGE` (see `isRedirectPageEnabled()` in BundlerDevServer.js). This project is Expo Go (no dev-client), so QR is ALWAYS the native URL — no interstitial, and EXPO_NO_REDIRECT_PAGE is irrelevant. Native URL scheme/port comes from `getUrlComponentsFromProxyUrl` in UrlCreator.js.

**SDK54 proxy bug + our patch (`patches/expo++@expo+cli+54.0.22.patch`):** with `EXPO_PACKAGER_PROXY_URL=https://HOST`, stock CLI produces `exp://HOST:443` (cleartext scheme on the TLS port = broken for everyone). We patch `getUrlComponentsFromProxyUrl`: for `scheme==='exp'` set `port='80'` → QR becomes `exp://HOST:80` (cleartext to the public http port, which the edge serves — proven via /status over http). Rationale: Android Expo Go connects most reliably over cleartext http (LAN default; Expo Go allows cleartext to dev servers); iOS still works because it follows any http→https redirect. Previous patch revision forced `exps://HOST:443` (worked iOS, Android "did nothing"); current revision switched to `exp://HOST:80` to try to unstick Android. VERIFY in the fresh Metro log: `Metro waiting on exp://HOST:80` (read the NEWEST /tmp/logs file — old snapshots are stale). Can only be confirmed on Android by the USER (no way to drive the Replit Android emulator or a phone from tools). Do NOT revert the patch entirely: without it the QR is the broken `exp://HOST:443`.

**Two Replit-native test paths (from docs):** (1) Preview panel device selector → iOS Simulator / **Android Emulator** ("Simulate on Android") — this is a PAID feature, only on Core/Pro/Enterprise plans; on free plans it won't work (likely why "Simulate on Android" fails — a plan matter, not code). (2) Real phone → Preview panel **"Open in Expo Go"** button + scan (Replit-managed QR), NOT necessarily the Expo CLI console QR. iPhone (Camera QR) and browser already work.

**Regression is EXTERNAL, not in the repo:** the `expo:dev` script (`--localhost` + `EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN`) and `.replit` ports have been byte-identical for 25+ commits. So "it worked before without ngrok" is not explained by any repo change — the cause is the Expo SDK 54 toolchain upgrade (introduced the exp→exps proxy bug we patched) and/or an Expo Go app update on the phone tightening the http status probe. Note the container itself can't resolve external DNS (`dig @8.8.8.8` empty) and hits the domain via internal IP 172.24.0.5, so port-80 tests from inside are NOT representative of the phone's public-edge path — do not over-conclude from internal curl about what the phone sees; the decisive proof is the native `http://%s/status` template + phone-side failure.
