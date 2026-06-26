---
name: AI (OpenAI) hardening conventions
description: Durable rules for how AI/OpenAI functions, errors, and quota must behave in this app
---

Convenzioni adottate per le funzioni AI (OpenAI) di FamilySync, da rispettare in ogni nuova rotta/funzione AI.

- **Errori sempre tipizzati**: ogni funzione in `server/lib/openai.ts` chiama `assertAiConfigured()` all'inizio e propaga `mapOpenAiError(err)` (mai `return []` silenzioso su parse/validazione/timeout). Codici: AI_NOT_CONFIGURED(503), AI_RATE_LIMITED(429), AI_TIMEOUT(504), AI_BAD_RESPONSE(502), AI_PROVIDER_ERROR(502). `SyntaxError`/`ZodError` → AI_BAD_RESPONSE.
  **Why:** un fallback silenzioso degradava l'UX e nascondeva problemi di config/costi prima della pubblicazione.

- **Quota per famiglia/giorno**: middleware `aiRateLimit(feature)` in catena DOPO `requireAiEnabled` e `requireFamilyMember`. **Solo i success consumano quota** (`recordAiUsage(..., true/false)`), e il check è **fail-open** (se il conteggio DB fallisce, non blocca l'utente). Limiti in `AI_DAILY_LIMITS`.
  **Why:** i fallimenti del provider non devono penalizzare l'utente; un check quota rotto non deve impedire l'uso.

- **Mai esporre la chiave**: nessun log del valore di `AI_INTEGRATIONS_OPENAI_API_KEY`; baseURL OpenAI impostata solo se l'env è presente.

- **Frontend**: usare `lib/ai-error-message.ts` (`aiErrorMessage`, `isAiDisabled`) per mostrare messaggi italiani semplici; preferisce `err.body.error.message` del server, fallback per codice. AI_DISABLED resta gestito separatamente (toggle impostazioni).

- **Dedup risorse uniche** (es. meal plan settimanale): check di esistenza → 409 + catch race su unique con `isUniqueViolation()` (`server/lib/db-errors.ts`, SQLSTATE 23505).

- **Test**: `npm run test:ai` (node:test via tsx). Le unità DB-coupled (es. `aiRateLimit`) usano hook `__setQuotaCounterForTest`/`__resetQuotaCounterForTest`. I middleware 403 (requireAiEnabled / requireFamilyMember) sono DB-coupled e verificati dal wiring delle rotte, non da test di integrazione.
