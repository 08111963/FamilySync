---
name: Public asset Cross-Origin-Resource-Policy
description: Why public /uploads static assets must set CORP cross-origin, or web (different-origin) clients silently fall back to placeholder
---

Public static assets served by the Express backend (`/uploads/avatars`, `/uploads/recipe-images`) must send `Cross-Origin-Resource-Policy: cross-origin` via `express.static({ setHeaders })`.

**Why:** helmet applies `Cross-Origin-Resource-Policy: same-origin` by default. When the app page is loaded from a DIFFERENT origin than the API host, the browser blocks the `<img>` and the UI falls back to its placeholder (e.g. Avatar shows colored initials, not the photo). This bit us when an invited user viewed the Expo **web** app via the ngrok tunnel origin while images came from the `:5000` backend origin — admin on **native** Expo Go saw the photos (native ignores CORP), the web user did not. Same mismatch happens in prod when the web domain differs from the API domain.

**How to apply:** any intentionally-public (no media-token) static mount that renders in a browser `<img>` needs CORP `cross-origin`. Authenticated `/uploads` mounts can stay same-origin. Symptom to recognize: image works on native / admin but shows placeholder on web / for the owner — check response headers for `Cross-Origin-Resource-Policy` before touching frontend URL resolution.
