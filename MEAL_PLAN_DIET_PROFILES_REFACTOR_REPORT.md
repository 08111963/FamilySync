# Refactor Profili Dieta — Piano Pasti

## Risultato

Il Piano Pasti usa ora un solo campo `dietProfile` a catalogo chiuso. Il form condiviso Expo/web non mostra più il campo libero “Allergie / intolleranze”.

## Profili disponibili

| Identificatore | Etichetta italiana |
| --- | --- |
| `mediterranean` | Mediterranea |
| `mediterranean_gluten_free` | Mediterranea senza glutine |
| `mediterranean_lactose_free` | Mediterranea senza lattosio |
| `vegetarian` | Vegetariana |
| `vegetarian_gluten_free` | Vegetariana senza glutine |
| `vegan` | Vegana |
| `pescetarian` | Pescetariana |
| `low_carb` | Low carb |
| `halal` | Halal |

Pescetariana, low carb e halal erano profili già supportati: sono stati mantenuti come scelte fisse per evitare regressioni.

## Garanzie

- La pipeline applica profilo → catalogo compatibile → prompt/schema → validatore finale.
- Senza glutine usa solo sostituzioni esplicite; senza lattosio resta distinto da “senza latte” e richiede prodotti dichiarati compatibili.
- I tre profili mediterranei compatibili richiedono almeno un pasto principale
  con carne rossa, preferibilmente uno. Vegetariani e vegani la rifiutano nel
  validatore.
- `allergies` legacy è accettato solo per non rompere client precedenti, ma viene ignorato e non è salvato né inoltrato al modello.
- Vecchi metadata vengono normalizzati in lettura; non sono mostrati e non possono rilassare i vincoli.
- Il limite `MAX_MEAL_PLAN_MODEL_CALLS = 28` non è stato modificato.

## Voce e contenuti

- La dettatura riconosce esclusivamente espressioni dei profili fissi e lascia il profilo come unico vincolo.
- Allergie o intolleranze nella nota non vengono estratte come vincoli.
- Guida e disclaimer indicano di verificare le etichette e consultare un professionista per esigenze individuali.

## Ricerca riferimenti legacy

Le occorrenze residue di `allergies` sono limitate a: compatibilità input esplicitamente ignorata del Piano Pasti, test di non-propagazione, e funzionalità Ricette/Privacy non coinvolte da questo refactor.

## Verifiche

- `npm run typecheck`
- `npx tsx server/__tests__/meal-plan-diet-profiles.test.ts`
- `git diff --check`

Nessun deploy, pubblicazione o migrazione database è stato eseguito.

## Correzione dopo controllo esterno

- Il controllo **Dieta** è ora un singolo selettore: mostra il solo valore
  scelto e apre un menu cross-platform con i nove profili fissi.
- Il test E2E verifica il valore iniziale Mediterranea, apertura del menu,
  presenza delle opzioni, selezione di `vegetarian_gluten_free`, chiusura del
  menu e body AI privo di `allergies`.
- Per la dieta mediterranea il prompt richiede almeno un pasto principale con
  carne rossa nella settimana, preferibilmente uno: non impone più
  rigidamente un solo pasto.

### Verifiche finali

- `npm run typecheck`
- `npx tsx server/__tests__/meal-plan-diet-profiles.test.ts`
- `npx tsx server/__tests__/meal-plan-variety.test.ts`
- `npx tsx server/__tests__/meal-plan-model-budget.test.ts`
- `npx tsx --test e2e/meal-plan-diet-selector.test.ts`
- `git diff --check`

## Garanzia deterministica carne rossa

- Il blueprint proteico assegna esattamente un target `red_meat` a uno dei
  sette pranzi dei soli profili `mediterranean`,
  `mediterranean_gluten_free` e `mediterranean_lactose_free`: è quindi incluso
  tra i quattordici pasti principali, prima di qualsiasi chiamata AI.
- Il catalogo chiuso riconosce e può usare solo carni già presenti nelle regole
  del Piano Pasti (`manzo`, `vitello`, `maiale`, `agnello`; anche `suino` è
  riconosciuto nella verifica), senza ingredienti fittizi.
- Il controllo locale valuta insieme pranzo e cena. Se il modello ignorasse il
  target, il piano viene rifiutato in modo fail-closed: non viene consegnato,
  non viene rigenerata la settimana e non si consumano chiamate OpenAI extra.
- I test coprono: Mediterranea con carne rossa, assenza rilevata localmente,
  Mediterranea senza glutine, Vegetariana e Vegana. Il cap globale resta
  `MAX_MEAL_PLAN_MODEL_CALLS = 28`.

### Verifiche della correzione

- `npx tsx --test --test-name-pattern='mediterranea senza allergie|mediterranea senza glutine mantiene|mediterranea rifiuta' server/__tests__/meal-plan-generation.test.ts`
- `npm run typecheck`
- `npx tsx server/__tests__/meal-plan-diet-profiles.test.ts`
- `npx tsx server/__tests__/meal-plan-variety.test.ts`
- `npx tsx server/__tests__/meal-plan-model-budget.test.ts`
- `npx tsx --test e2e/meal-plan-diet-selector.test.ts`