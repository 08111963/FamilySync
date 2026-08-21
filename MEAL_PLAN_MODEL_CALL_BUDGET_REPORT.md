# Verifica finale budget chiamate modello — Piano Pasti

Data: 21 agosto 2026  
Ambito: generazione Piano Pasti standard e streaming. Nessuna chiamata OpenAI
reale è stata eseguita: le verifiche usano un client mockato.

## Decisione

Il cap centralizzato `MAX_MEAL_PLAN_MODEL_CALLS` passa da **42** a **28**.

Il valore non è un margine arbitrario: è il minimo che permette una settimana
standard completa (14 chiamate) e **una sola** seconda settimana completa
quando il primo risultato è malformato, incompleto o viola un vincolo
alimentare. Non esiste più una rigenerazione completa per sola varietà.

## Costi verificati

| Percorso | Calcolo | Chiamate | Priorità |
| --- | --- | ---: | --- |
| Standard, 3 pasti/giorno | 7 colazioni + 7 blocchi pranzo/cena | 14 | obbligatorio |
| Solo lactose | colazioni deterministiche + 7 blocchi pranzo/cena | 7 | obbligatorio |
| Gluten o altro allergene standard | come standard | 14 | obbligatorio |
| Retry formato standard | 14 + 14 | 28 | obbligatorio/fail closed |
| Retry vincolo/allergene standard | 14 + 14 | 28 | obbligatorio/fail closed |
| Un repair locale | 14 + 1 | 15 | best effort dopo sicurezza |
| Tre repair locali | 14 + 3 | 17 | best effort, massimo tre |
| Retry lactose + repair locale | 7 + 7 + 1 | 15 | retry obbligatorio, repair best effort |
| Caso peggiore osservato | due settimane standard complete | 28 | cap rispettato |

Ogni chiamata riserva il suo posto nel contatore **prima** dell'invocazione al
provider. Prima di avviare una settimana completa, il generatore verifica che
il residuo sia sufficiente per terminarla: un retry non può quindi partire a
metà. Il rifiuto per budget è `AI_MODEL_CALL_BUDGET_EXHAUSTED`; non viene
restituito un piano parziale o con violazioni.

## Ordine delle priorità

1. Completezza, formato e sicurezza di allergie/dieta sono obbligatori.
2. Un retry completo per formato o vincolo ha priorità sul miglioramento
   estetico della varietà.
3. I repair di varietà sono locali, al massimo tre e usano lo stesso budget.
4. Se il piano è completo e sicuro ma resta monotono, viene restituito come
   best effort con telemetria di advisory: non viene pagata un'altra settimana.

## Copertura di regressione

I test verificano esplicitamente: standard 14, lactose 7, gluten 14, retry
malformato, retry di vincolo, repair singolo, tre repair locali, retry più
repair locale, budget quasi esaurito, cap peggiore 28 e rifiuto di un piano
allergenico quando non rimane budget. Entrambe le route applicative passano il
cap centralizzato.

Nell'ultima esecuzione completa: typecheck riuscito; suite AI **114/114**;
famiglia estesa Piano Pasti **111/111** su 16 file; fallimenti **0**. Il massimo
osservato dai fixture di generazione è **28** chiamate.