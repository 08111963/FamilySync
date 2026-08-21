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
- Il profilo mediterraneo richiede un pasto settimanale con carne rossa magra; vegetariano e vegano la rifiutano nel validatore.
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