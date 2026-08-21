# Pilot provider AI per admin — Fase 1

## Esito

Completata la Fase 1 del pilot: la selezione del provider AI avviene sul
server, per singola operazione, usando il ruolo affidabile della membership
familiare. Non sono stati modificati Secrets, database, UI mobile, prompt,
modelli, pagamenti, profili dieta o logica allergeni.

## Regole applicate

| Contesto | Provider |
| --- | --- |
| Utente autenticato con ruolo familiare `admin` e `OPENAI_API_KEY` presente | OpenAI diretto |
| Admin senza chiave diretta | Replit Managed AI |
| Adulto, teen o child | Replit Managed AI |
| Job o lavoro in background | Replit Managed AI |

Il ruolo non viene mai letto dal client: viene preso da
`requireFamilyMember()` e dalla membership caricata dal database.

## Implementazione

- I due provider usano client OpenAI separati e memorizzati per provider,
  evitando che richieste concorrenti mescolino endpoint o credenziali.
- Il provider viene passato esplicitamente alle quote e a ogni operazione AI
  interattiva. Le quote, le prenotazioni e il tracciamento restano invariati.
- Il Piano Pasti conserva il budget rigido di **28 chiamate massime**:
  nessun retry, repair o chiamata aggiuntiva è stato introdotto.
- Il monitor del Piano Pasti e il prewarm delle immagini usano
  esplicitamente/restituiscono di default Replit Managed AI.
- I log di diagnosi sono allow-listed: `provider`, `operation` e `userRole`.
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
9. `bash scripts/export-consegna.sh familysync-ai-provider-admin-pilot-20260821.zip`
   con controllo `unzip -t` e scansione anti-segreti sullo ZIP finale.

Copertura specifica del pilot:

- admin con chiave diretta;
- utente non admin e job su Replit;
- fallback admin quando la chiave diretta manca;
- configurazione diretta senza base URL Replit;
- due richieste concorrenti con client distinti;
- job di bilanciamento che fissa esplicitamente Replit;
- regressione del budget Piano Pasti di 28 chiamate.

## Limiti intenzionali della Fase 1

- Nessuna chiave è stata aggiunta o alterata.
- Il provider non viene salvato nella tabella `ai_usage`: i dati di utilizzo,
  schema e migrazioni restano invariati in questa fase.
- Nessun deploy o publish è stato eseguito.