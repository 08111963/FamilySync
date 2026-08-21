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

Risultati rilevanti: 24 test vincoli, 18 test generatore e 11 test HTTP/DB
superati. I test di generazione usano un client OpenAI fittizio: non sono state
effettuate chiamate OpenAI aggiuntive durante questa correzione.

## Esclusioni deliberate

- Nessun deploy, publish o modifica dell'ambiente di produzione.
- Nessuna modifica a quota AI, retry, streaming, schema DB o segreti.