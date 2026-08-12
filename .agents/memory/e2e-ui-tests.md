---
name: Test UI e2e committati (Playwright)
description: Convenzioni per i test UI in e2e/ e perché un run del tester subagent non basta per chiudere un task di verifica UI.
---

**Regola:** un task "test UI" va chiuso con un test Playwright COMMITTATO in `e2e/` (pattern degli altri file lì): il code review di completamento rifiuta run non riproducibili fatti solo dal tester subagent.

**Why:** il reviewer valuta il diff committato; un run del subagent non è revisionabile né ripetibile.

**How to apply:**
- Pattern `e2e/*.test.ts`: node:test + playwright, chromium da `/nix/store/...` (o `E2E_CHROMIUM_PATH`), backend dev su :5000 che serve la web-build, TUTTE le `/api/**` stubbate via `page.route` con stato in-memory (anche gli stream AI come NDJSON: deterministico, zero quota).
- Auth: seed `localStorage` `@family_sync_auth` + `@family_sync_active_family` in `addInitScript`; riscrivere il throw inlinato di getApiUrl nei bundle `_expo/static/js` verso BASE_URL.
- Dialoghi web `window.confirm/alert`: `page.once("dialog", ...)` PRIMA del tap; per asserire "nessuna chiamata" catturare i body nelle route stubbate.
- Occhio alle race: un testo già visibile in anteprima non prova il salvataggio — attendere la scomparsa del bottone (`state: "detached"`) o pollare i body catturati.
- Rate limiter in-memory (login per-email, /api globale): un riavvio del backend li azzera se il tester subagent incappa in 429.
- Per testare il rollback transazionale lato server: un `recipeId` UUID valido ma inesistente passa Zod e viola la FK DENTRO la transazione (dopo la delete) → rollback reale.
