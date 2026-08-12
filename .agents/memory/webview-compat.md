---
name: Compatibilità WebView in-app (WhatsApp/Gmail)
description: Perché il bundle web crashava sui browser in-app Android e come restano protetti i metodi JS moderni.
---

**Regola:** il bundle Expo web esportato usa metodi JS moderni delle dipendenze (react-navigation chiama `routes.findLast(...)` a ogni navigazione; nel bundle ci sono anche `toSorted/toReversed`, `structuredClone`, `Object.hasOwn`, `.at`, `replaceAll`, `crypto.randomUUID`). Sui WebView Android datati (browser in-app di WhatsApp/Gmail) mancano → TypeError durante il render → ErrorBoundary "Something went wrong", mentre i browser desktop funzionano.

**Fix:** `lib/runtime-polyfills.ts`, importato come PRIMO import di `app/_layout.tsx` (guard `typeof`, no-op su runtime moderni/Hermes). Non rimuovere né spostare quell'import.

**How to apply:**
- Se ricompare un crash solo su browser in-app: `grep` sul bundle esportato per nuovi metodi moderni (es. `Object.groupBy`, `Array.fromAsync`) e aggiungerli al polyfill.
- Verifica riproducibile: `e2e/join-link-webview.test.ts` simula il WebView vecchio cancellando i metodi con `addInitScript` prima del bundle.
- Limite noto: la sintassi (`??=`, `||=`) richiede comunque Chrome/WebView ≥ 85; non polyfillabile senza cambiare i target di transpilazione.
- Playwright: l'ULTIMA `page.route` registrata ha precedenza → registrare la route generica `**/api/**` PRIMA di quelle specifiche.
