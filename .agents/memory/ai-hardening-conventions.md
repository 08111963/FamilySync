---
name: AI (OpenAI) hardening conventions
description: Durable rules for how AI/OpenAI functions, errors, and quota must behave in this app
---

Convenzioni adottate per le funzioni AI (OpenAI) di FamilySync, da rispettare in ogni nuova rotta/funzione AI.

- **Errori sempre tipizzati**: ogni funzione in `server/lib/openai.ts` chiama `assertAiConfigured()` all'inizio e propaga `mapOpenAiError(err)` (mai `return []` silenzioso su parse/validazione/timeout). Codici: AI_NOT_CONFIGURED(503), AI_RATE_LIMITED(429), AI_TIMEOUT(504), AI_BAD_RESPONSE(502), AI_PROVIDER_ERROR(502). `SyntaxError`/`ZodError` → AI_BAD_RESPONSE.
  **Why:** un fallback silenzioso degradava l'UX e nascondeva problemi di config/costi prima della pubblicazione.

- **Quota per famiglia/giorno**: NON più middleware. La rotta usa `reserveAiSlot(userId, familyId, feature)` PRIMA di OpenAI e `finalizeAiUsage(usageId, success)` dopo; o il wrapper `withAiUsage(ctx, fn)` per le funzioni senza fallback. Tabella `ai_usage` ha colonna `status` enum (`started`|`succeeded`|`failed`), NON più `success` boolean. **La quota conta TUTTI i tentativi del giorno** (started+succeeded+failed): ogni chiamata che raggiunge OpenAI consuma quota, anche fallimento/timeout/JSON malformato/Zod/provider error. Limiti in `AI_DAILY_LIMITS`.
  **Why:** anche le chiamate fallite costano token; contare solo i success permetteva retry infiniti su errori = costo incontrollato.
  **How to apply:** `reserve` esiti = `ok`(record started creato)/`limited`(429)/`unavailable`(DB giù). Fail-closed di default → `unavailable`=503 `AI_USAGE_UNAVAILABLE`. Eccezione `shopping-suggestions`: su `unavailable` usa SOLO fallback locale, MAI OpenAI.

- **Race condition quota**: `reserveAiSlot` fa count+insert "started" dentro `db.transaction` + `pg_advisory_xact_lock(hashtext('ai_usage:<familyId>:<feature>'))`, che serializza i concorrenti sulla stessa (famiglia, feature). Richiede driver con transazioni reali (`@neondatabase/serverless` Pool + `drizzle-orm/neon-serverless`, NON il driver HTTP).
  **Why:** col vecchio check-poi-scrivi due richieste concorrenti passavano entrambe il check e superavano la quota (overshoot).
  **How to apply:** stream (`/weekly-meal-plan/stream`) fa reserve manuale PRIMA di `flushHeaders` (così 429/503 hanno ancora un HTTP status); poi `try/finally` con flag idempotente `finalizeUsageOnce` garantisce che lo slot non resti mai "started" (successo→succeeded; errore/disconnessione/early-return→failed); guard `if(clientClosed)return` dopo reserve evita chiamate OpenAI inutili.

- **Varianti piano pasti**: prima pubblicazione = 1 variante per tutti (premium disabilitato). `resolveMealPlanVariants()` / `MEAL_PLAN_MAX_VARIANTS=1` in `server/lib/ai-policy.ts` clampa la rotta non-stream. NB: la rotta `/weekly-meal-plan/stream` usa `planVariant` (1|2) come *hint di stile* per UN singolo piano (feature "genera alternativa"), 1 quota a chiamata — NON va forzato a 1, altrimenti l'alternativa diventa identica.
  **Why:** `variants=2` generava 2 piani con 1 sola quota (2x costo OpenAI).

- **Mai esporre la chiave**: nessun log del valore di `AI_INTEGRATIONS_OPENAI_API_KEY`; baseURL OpenAI impostata solo se l'env è presente.

- **Frontend**: usare `lib/ai-error-message.ts` (`aiErrorMessage`, `isAiDisabled`) per mostrare messaggi italiani semplici; preferisce `err.body.error.message` del server, fallback per codice. AI_DISABLED resta gestito separatamente (toggle impostazioni).

- **Dedup risorse uniche** (es. meal plan settimanale): check di esistenza → 409 + catch race su unique con `isUniqueViolation()` (`server/lib/db-errors.ts`, SQLSTATE 23505).

- **Test**: `npm run test:ai` (node:test via tsx). `ai-usage.test.ts` inietta uno store in-memory atomico via `__setAiUsageStoreForTest`/`__resetAiUsageStoreForTest` (interface `AiUsageStore`): verifica reserve/finalize, withAiUsage (malformato/timeout/provider→failed, ok→succeeded, limited/unavailable→OpenAI NON chiamato), concorrenza→no overshoot. `ai-usage-db.test.ts` è integration sul DB reale (skip se manca `DATABASE_URL`): N richieste concorrenti reserve, assert esatti `max` ok + righe DB; cleanup via cascade delete family+user. I middleware 403 (requireAiEnabled / requireFamilyMember) sono DB-coupled e verificati dal wiring delle rotte.
