---
name: AI (OpenAI) hardening conventions
description: Durable rules for how AI/OpenAI functions, errors, and quota must behave in this app
---

Convenzioni adottate per le funzioni AI (OpenAI) di FamilySync, da rispettare in ogni nuova rotta/funzione AI.

- **Errori sempre tipizzati**: ogni funzione in `server/lib/openai.ts` chiama `assertAiConfigured()` all'inizio e propaga `mapOpenAiError(err)` (mai `return []` silenzioso su parse/validazione/timeout). Codici: AI_NOT_CONFIGURED(503), AI_RATE_LIMITED(429), AI_TIMEOUT(504), AI_BAD_RESPONSE(502), AI_PROVIDER_ERROR(502). `SyntaxError`/`ZodError` → AI_BAD_RESPONSE.
  **Why:** un fallback silenzioso degradava l'UX e nascondeva problemi di config/costi prima della pubblicazione.

- **Quota per famiglia/giorno**: middleware `aiRateLimit(feature, { failOpen? })` in catena DOPO `requireAiEnabled` e `requireFamilyMember`, quindi PRIMA dell'handler/OpenAI. **Solo i success consumano quota** (`recordAiUsage(..., true/false)`). Il check quota è **FAIL-CLOSED di default**: se il conteggio DB fallisce → 503 `AI_USAGE_UNAVAILABLE` (no chiamata OpenAI). Solo `shopping-suggestions` passa `{ failOpen: true }` (ha fallback pool). Limiti in `AI_DAILY_LIMITS`.
  **Why:** se non si può verificare il limite, non si devono rischiare costi OpenAI incontrollati. I fallimenti del *provider* (non del check quota) non penalizzano comunque l'utente perché non vengono registrati come success.

- **Varianti piano pasti**: prima pubblicazione = 1 variante per tutti (premium disabilitato). `resolveMealPlanVariants()` / `MEAL_PLAN_MAX_VARIANTS=1` in `server/lib/ai-policy.ts` clampa la rotta non-stream. NB: la rotta `/weekly-meal-plan/stream` usa `planVariant` (1|2) come *hint di stile* per UN singolo piano (feature "genera alternativa"), 1 quota a chiamata — NON va forzato a 1, altrimenti l'alternativa diventa identica.
  **Why:** `variants=2` generava 2 piani con 1 sola quota (2x costo OpenAI).

- **Mai esporre la chiave**: nessun log del valore di `AI_INTEGRATIONS_OPENAI_API_KEY`; baseURL OpenAI impostata solo se l'env è presente.

- **Frontend**: usare `lib/ai-error-message.ts` (`aiErrorMessage`, `isAiDisabled`) per mostrare messaggi italiani semplici; preferisce `err.body.error.message` del server, fallback per codice. AI_DISABLED resta gestito separatamente (toggle impostazioni).

- **Dedup risorse uniche** (es. meal plan settimanale): check di esistenza → 409 + catch race su unique con `isUniqueViolation()` (`server/lib/db-errors.ts`, SQLSTATE 23505).

- **Test**: `npm run test:ai` (node:test via tsx). Le unità DB-coupled (es. `aiRateLimit`) usano hook `__setQuotaCounterForTest`/`__resetQuotaCounterForTest`. I middleware 403 (requireAiEnabled / requireFamilyMember) sono DB-coupled e verificati dal wiring delle rotte, non da test di integrazione.
