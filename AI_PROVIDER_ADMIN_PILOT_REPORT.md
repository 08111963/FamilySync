# Pilot provider AI per allowlist utente — Fase 1

## Esito

Completata la Fase 1 del pilot: la selezione del provider AI avviene sul
server, per singola operazione, usando esclusivamente una allowlist di user ID
interni configurata con `OPENAI_DIRECT_PILOT_USER_IDS`. Il ruolo nella famiglia
non partecipa mai alla scelta del provider. Non sono stati modificati Secrets,
database, UI mobile, prompt, modelli, pagamenti, profili dieta o logica
allergeni.

## Regole applicate

| Contesto | Provider |
| --- | --- |
| User ID autenticato presente in `OPENAI_DIRECT_PILOT_USER_IDS` e `OPENAI_API_KEY` presente | OpenAI diretto |
| User ID in allowlist senza chiave diretta | Replit Managed AI |
| User ID non in allowlist, incluso un family admin | Replit Managed AI |
| Allowlist assente o vuota | Replit Managed AI per tutti |
| Job o lavoro in background | Replit Managed AI |

La allowlist accetta esclusivamente user ID interni separati da virgola, è
letta solo sul server e non viene mai restituita né scritta nei log. I ruoli
familiari (admin, adult, teen e child) servono ancora alle autorizzazioni delle
route, ma non hanno alcun effetto sul provider AI.

## Implementazione

- I due provider usano client OpenAI separati e memorizzati per provider,
  evitando che richieste concorrenti mescolino endpoint o credenziali.
- Il provider viene passato esplicitamente alle quote e a ogni operazione AI
  interattiva. Le quote, le prenotazioni e il tracciamento restano invariati.
- Il Piano Pasti conserva il budget rigido di **28 chiamate massime**:
  nessun retry, repair o chiamata aggiuntiva è stato introdotto.
- Il monitor del Piano Pasti e il prewarm delle immagini usano
  esplicitamente/restituiscono di default Replit Managed AI.
- I log di diagnosi sono allow-listed: `provider`, `operation` e `pilot`.
  Non includono chiavi, base URL completi, prompt, testi utente, identificativi
  o dati personali.

## Verifiche eseguite (tutte con mock, nessuna chiamata AI reale)

1. `npx tsc --noEmit --pretty false`
2. `npx tsx server/__tests__/ai-provider-admin-pilot.test.ts`
3. `npx tsx server/__tests__/meal-plan-balance-monitor.test.ts`
4. `npx tsx server/__tests__/ai-errors.test.ts`
5. `npx tsx server/__tests__/meal-plan-generation.test.ts`
6. `npx tsx server/__tests__/meal-plan-balance.test.ts`
7. `npx tsx server/__tests__/transcribe-short-clip.test.ts`
8. `git diff --check`
9. Creazione dell'archivio minimale
   `familysync-ai-provider-admin-pilot-final-20260822.zip`, con controllo
   `unzip -t` e scansione anti-segreti sullo ZIP finale.

Copertura specifica del pilot:

- user ID in allowlist con chiave diretta;
- family admin e adult non in allowlist su Replit;
- fallback dell'utente in allowlist quando la chiave diretta manca;
- allowlist assente o vuota su Replit per tutti;
- configurazione diretta senza base URL Replit;
- due richieste concorrenti (pilot e family admin normale) con client distinti;
- job di bilanciamento che fissa esplicitamente Replit;
- regressione del budget Piano Pasti di 28 chiamate.

## Limiti intenzionali della Fase 1

- Nessuna chiave è stata aggiunta o alterata.
- Il provider non viene salvato nella tabella `ai_usage`: i dati di utilizzo,
  schema e migrazioni restano invariati in questa fase.
- Nessun deploy o publish è stato eseguito.