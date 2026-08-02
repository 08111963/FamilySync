---
name: Recipe gen sessions (incremental AI)
description: Convention for the DB-backed incremental recipe generation sessions and restart/stale handling
---

Le sessioni della generazione incrementale ricette sono persistite su DB (tabella recipe_gen_sessions), NON in-memory.

**Why:** con sessioni in-memory un riavvio/deploy a metà generazione dava 404 al polling con quota già consumata; su più istanze il polling poteva colpire un'istanza diversa da quella che generava.

**How to apply:**
- `updatedAt` è un heartbeat: il GET di polling chiude le sessioni non-done più vecchie di ~90s con UPDATE condizionato su `done=false` (mai sovrascrivere un finale legittimo di un'altra istanza) e restituisce le ricette parziali con flag `interrupted`.
- Nessuna ricetta + interrotta → errore tipizzato `AI_INTERRUPTED` (503). La quota NON viene mai riconsumata dal polling.
- Il client tratta il 404 del polling come "sessione scaduta/interrotta" (messaggio chiaro, ricette già ricevute conservate), non come errore generico.
- TTL 10 min con sweep best-effort a ogni POST incrementale.
- Migrazione: 0018_recipe_gen_sessions.sql (da portare in prod come le altre).

## Latenza AI (convenzione)
Il tempo AI è dominato dai token di OUTPUT: dividere N ricette in chiamate parallele più piccole (con hint di stile/tema per evitare doppioni tra parallele, poi dedupe finale) riduce il tempo a ~1/chiamate. Applica: recipe-search = 3 chiamate da 1 ricetta; suggerimenti incrementali = primo batch da 1 (primo risultato veloce) + resto in batch da 3; piano pasti = ondate da 3 giorni + ripassata anti-doppioni. Quota: withAiUsage resta 1 riserva per richiesta anche con più chiamate provider (scelta intenzionale). Polling client fitto (450ms) solo finché non arriva il primo batch, ref da resettare a ogni nuova generazione.

## Piano pasti: varietà e diete
Con giorni generati in chiamate indipendenti, le regole "in prosa" sulla distribuzione settimanale (es. dieta mediterranea) NON bastano: il modello scivola su legumi/vegetariano. Serve uno schema esplicito per-giorno (activeDayThemes: pranzo/cena concreti per ciascuno dei 7 giorni) + regola verdure a ogni pranzo/cena. Anche le colazioni richiedono temi rotanti dedicati, altrimenti propone sempre la stessa.
