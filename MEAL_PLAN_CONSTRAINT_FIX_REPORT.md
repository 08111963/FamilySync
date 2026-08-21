# Correzione vincoli Piano Pasti

**Data:** 21 agosto 2026  
**Stato:** verificata localmente; nessun deploy o publish eseguito.

## Problema corretto

Le preferenze alimentari potevano essere interpretate in modo diverso a seconda
che fossero inserite in `diet` oppure in `allergies`. Inoltre, la precedente
allowlist ricavava una blacklist dalle singole parole dei campi liberi: questo
poteva escludere impropriamente un ingrediente dichiarato sicuro, come
`pane senza glutine`.

## Correzione applicata

- È stata introdotta una normalizzazione canonica unica per pattern alimentari
  (`mediterranean`, `vegetarian`, `vegan`, ecc.) ed esclusioni (`gluten`,
  `lactose`, `milk`, ecc.).
- `senza glutine`, `gluten-free`, `celiaco/a` e varianti equivalenti producono
  l'esclusione `gluten`; le varianti di lattosio producono `lactose`.
- L'allergia a latte/proteine del latte resta `milk`, distinta dal solo
  `lactose`: un prodotto etichettato “senza lattosio” non è ammesso per
  `milk`.
- Prompt, schema strutturato, allowlist, colazioni deterministiche e
  validazione semantica leggono la stessa normalizzazione.
- L'allowlist non usa più token grezzi di dieta, allergie e note come blacklist.
  Per il glutine ammette prodotti trasformati solo con dicitura esplicita
  “senza glutine”, oltre a riso, quinoa, polenta, patate e legumi.
- Le colazioni deterministicamente prive di latticini usano anche pane
  esplicitamente senza glutine quando entrambi i vincoli sono presenti.
- Le etichette dell'interfaccia chiariscono la separazione tra dieta e
  allergie/intolleranze.

## File realmente modificati

- `app/meal-plans/index.tsx`
- `package.json`
- `server/lib/meal-plan-constraints.ts`
- `server/lib/openai.ts`
- `server/routes/ai.ts`
- `server/__tests__/meal-plan-constraints.test.ts`
- `server/__tests__/meal-plan-generation.test.ts`
- `server/__tests__/meal-plan-request-body.test.ts`
- `MEAL_PLAN_CONSTRAINT_FIX_REPORT.md`
- `MEAL_PLAN_CONSTRAINT_FIX_MANIFEST.txt`

Nell'archivio sono inclusi anche `server/routes/meal-plans.ts` e
`shared/schema.ts` come sorgenti pertinenti al percorso di persistenza, oltre a
`package.json` e `package-lock.json`; questi ultimi due sono stati inclusi per
riprodurre l'ambiente di test.

## Consenso salute

Una scelta esplicita come `diet: "senza glutine"` o
`diet: "senza lattosio"` non è trattata automaticamente come dato sanitario.
`diet: "celiaco"` e le allergie/intolleranze nel campo `allergies` restano
invece soggetti al consenso salute esistente.

## Copertura aggiunta

- equivalenza tra `diet` e `allergies` per glutine e lattosio;
- quattro casi singoli richiesti e validazione di piatti sicuri/non sicuri;
- distinzione `milk` / `lactose`;
- combinazioni mediterranea, vegetariana e vegana con esclusioni;
- allowlist di prodotti senza glutine e alimenti naturalmente compatibili;
- body reale della route con `diet: "senza glutine"` e
  `diet: "senza lattosio"`;
- prompt e schema della generazione simulata, con gli stessi budget di
  richieste esistenti (14 per glutine, 7 per lattosio).

## Verifiche eseguite

Tutti i comandi sono terminati con esito positivo:

```text
npm run typecheck
npm run test:ai
npx tsx server/__tests__/meal-plan-constraints.test.ts
npx tsx server/__tests__/meal-plan-generation.test.ts
npx tsx server/__tests__/meal-plan-replace.test.ts
git diff --check
```

`npm run test:ai` include ora anche i test dei vincoli, del generatore e del
body della route. Risultati rilevanti: 24 test vincoli, 18 test generatore,
3 test body route e 11 test HTTP/DB superati. I test di generazione usano un
client OpenAI fittizio: non sono state effettuate chiamate OpenAI aggiuntive
durante questa correzione. Il totale della copertura specifica Piano Pasti
eseguita è **56 test**.

## Confronto prima/dopo

| Percorso | Prima | Dopo |
|---|---|---|
| `diet: "senza glutine"` | La dieta poteva essere ignorata dalla health detection e i token liberi potevano filtrare ingredienti in modo incoerente. | Normalizzata a esclusione `gluten`, applicata a consenso, prompt, schema, allowlist e validatore; prodotti trasformati ammessi solo con dicitura esplicita. |
| `allergies: "glutine"` | Vincolo gestito separatamente dalla dieta e con allowlist incompleta. | Converge sulla stessa esclusione `gluten` del percorso Dieta, con validazione e alternative gluten-free equivalenti. |
| `diet: "senza lattosio"` | Il percorso dieta poteva non attivare la protezione deterministica del lattosio. | Normalizzata a esclusione `lactose`; colazioni naturalmente prive di latticini e pasta con glutine ancora ammessa. |
| `allergies: "lattosio"` | Vincolo funzionante ma non garantito equivalente al percorso Dieta. | Converge sulla stessa esclusione `lactose`; resta distinta da `milk` e dai prodotti solo “senza lattosio”. |

Il numero massimo di chiamate OpenAI per un piano resta **14** per il percorso
settimanale standard a tre pasti e **7** per il percorso a due pasti/colazioni
lattosio deterministiche. `MAX_CONSTRAINT_GENERATION_ATTEMPTS` e i budget
esistenti non sono stati aumentati.

## Esclusioni deliberate

- Nessun deploy, publish o modifica dell'ambiente di produzione.
- Nessuna modifica a quota AI, retry, streaming, schema DB o segreti.