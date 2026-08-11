---
name: Redazione log di produzione
description: Come vengono redatti i log in produzione (PII/token) e i vincoli da rispettare.
---

# Redazione log di produzione

- Regola: in produzione nessun log deve contenere email in chiaro, token, JWT o credenziali. La redazione è centralizzata nel logger (`server/lib/logger.ts`): in prod viene monkey-patchato `console.*` così anche i `console.log` diretti e le stack trace vengono redatti.
- **Why:** audit GDPR ago 2026 ha trovato email, URL di verifica/reset con token, e body di token-exchange OAuth nei log della dashboard Replit.
- **How to apply:**
  - Non fare mai il fallback all'oggetto originale se la serializzazione fallisce: usare `util.inspect` (gestisce cicli/BigInt) e in extremis `[UNLOGGABLE]`.
  - Limitare la lunghezza dell'input redatto (regex email quadratica su stringhe lunghe senza `@`).
  - Nuovi log: non loggare mai URL con token, body di scambi OAuth o `req.body` di webhook non redatti — la regex copre i casi comuni ma non tutti i formati.
  - Gli oggetti passati a `console.*` vengono serializzati con `util.inspect`: le regex devono coprire lo stile inspect con TUTTI gli stili di quote (', ", `) e chiavi quotate, non solo il JSON `"password":"x"` — un apostrofo nel valore altrimenti bypassa la redazione.
  - Il patch di console dipende da NODE_ENV al momento dell'import: la verifica prod vs dev va fatta in processi figli con l'env giusto, non nel processo di test.
  - Le email sono pseudonimizzate (prima lettera + dominio), non rimosse: se serve correlazione usare userId.
