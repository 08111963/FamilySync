# Audit sistematico allergeni e intolleranze — Piano Pasti

Data audit: 21 agosto 2026

## Esito sintetico

L’audit è stato eseguito sul percorso reale del Piano Pasti, senza chiamate
OpenAI reali. Il controllo copre i 15 vincoli di esclusione canonici già
supportati dal codice. Non sono stati aggiunti nuovi allergeni o nuove diete.

| Area | Esito |
| --- | --- |
| Violazioni P0 | Nessuna rilevata |
| Errori P1 dimostrati e corretti | 4 |
| Allowlist chiusa | Verificata e ri-validata |
| Validazione semantica | Verificata su titolo, descrizione, note, ingredienti e passaggi |
| Varietà | Verificata senza rilassare la sicurezza |
| Combinazioni | Verificate con mock e piano completo |
| Budget | Invariato: `MAX_MEAL_PLAN_MODEL_CALLS = 42` |
| Chiamate OpenAI reali | 0 |

## Perimetro effettivo

I pattern dietetici supportati, distinti dagli allergeni, sono:

`mediterranean`, `vegetarian`, `vegan`, `pescetarian`, `low-carb`, `halal`.

Le esclusioni canoniche supportate sono:

`gluten`, `lactose`, `milk`, `egg`, `peanut`, `nuts`, `fish`, `soy`,
`sesame`, `celery`, `mustard`, `lupin`, `sulfites`, `shellfish`, `molluscs`.

Testi di allergeni o note mediche non riconducibili a un vincolo supportato
non vengono trasformati silenziosamente in un vincolo permissivo: vengono
conservati come esclusioni custom conservative oppure rifiutati dalla route
quando contengono condizioni mediche non verificabili.

## Propagazione verificata

Il test parametrico verifica il percorso completo:

1. body con `weekStartDate` e `preferences` come inviato dall’app;
2. parser della route e controllo del consenso per dati relativi alla salute;
3. normalizzazione di sinonimi e forme italiane/inglesi;
4. vincolo canonico condiviso;
5. prompt con le esclusioni canoniche;
6. JSON Schema con enum chiuso degli ingredienti;
7. mock del modello al posto di OpenAI;
8. validazione finale dell’intero piano prima della consegna.

La validazione analizza separatamente titolo, descrizione, note, ogni nome
ingrediente e ogni passaggio. Un risultato non sicuro o incompleto non viene
restituito come piano parziale.

## Matrice individuale

La colonna “sicuro” è un marker testuale accettato dal validatore. Non è una
certificazione clinica, né garantisce l’assenza di contaminazione crociata
oltre a quanto dichiarato nel testo.

| Vincolo | Sinonimo/input | SICUREZZA — vietato | FALSE POSITIVE — sicuro | AMPIEZZA ALLOWLIST | VARIETÀ | RISCHIO RIGIDITÀ | COMBINAZIONI | MODEL CALLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gluten` | glutine, senza glutine | gallette di riso non dichiarate | gallette di riso senza glutine | pool non vuoto, ogni voce ri-validata | 4+ famiglie pranzo | medio, mitigato da pool dedicato | mediterranea + glutine + lattosio; vegana + glutine + nuts | 14 |
| `lactose` | lattosio, senza lattosio | ricotta | yogurt senza lattosio | pool colazione deterministico + pool principale | 4+ famiglie pranzo | alto se si usa solo pasta/pomodoro/tonno; monitorato | mediterranea + lactose | 7 |
| `milk` | latte, caseina, derivati | caseina | yogurt vegetale di cocco | pool non vuoto e distinto da lactose | 4+ famiglie pranzo | medio | vegetariana + milk + egg | 14 |
| `egg` | uova, albume, tuorlo | maionese | maionese vegana | pool non vuoto | 4+ famiglie pranzo | medio | vegetariana + milk + egg | 14 |
| `peanut` | arachidi, burro di arachidi | burro di arachidi | riso | pool non vuoto, validazione conservativa | 4+ famiglie pranzo | basso/medio | pesce + arachidi | 14 |
| `nuts` | noce, frutta a guscio | noce | riso | pool non vuoto, singolare normalizzato | 4+ famiglie pranzo | basso/medio | vegana + glutine + nuts | 14 |
| `fish` | pesce, specie comuni | sogliola | riso | pool non vuoto, specie incluse | 4+ famiglie pranzo | medio | pesce + arachidi | 14 |
| `soy` | soia, tofu | tofu | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | vegan + soy | 14 |
| `sesame` | sesamo, tahini | tahini | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `celery` | sedano | sedano | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `mustard` | senape | senape | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `lupin` | lupini, lupino | lupino | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `sulfites` | solfiti, anidride solforosa | anidride solforosa | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `shellfish` | crostacei, gamberetti | gamberetti | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |
| `molluscs` | molluschi, vongole | vongole | riso | pool non vuoto | 4+ famiglie pranzo | basso/medio | combinazioni cumulative | 14 |

### Distinzione `lactose` ≠ `milk`

La distinzione è mantenuta deliberatamente:

- `lactose` può accettare un prodotto esplicitamente senza lattosio;
- `milk` non viene soddisfatto dalla sola dicitura “senza lattosio”;
- un prodotto vegetale esplicito è il marker usato per l’esclusione `milk`;
- i prompt, gli enum e la validazione mantengono i due codici separati.

## Falsi positivi e bypass controllati

Sono stati testati tutti i cinque campi della ricetta per ogni vincolo. Per il
glutine sono inoltre bloccati i casi in cui un marker sicuro viene esteso
erroneamente a un altro prodotto o a una seconda occorrenza nella stessa
frase, inclusi:

- `gallette di riso con pasta senza glutine`;
- `pasta senza glutine con pasta`;
- `gallette di riso senza glutine con gallette di riso`;
- `pasta senza glutine con glutine aggiunto`.

Il marker deve qualificare l’occorrenza a cui si riferisce; non può rendere
sicuro l’intero testo per prossimità.

## Allowlist, rigidità e varietà

Per ogni scenario parametrico:

- il pool principale è non vuoto;
- ogni ingrediente dell’enum viene sottoposto nuovamente al validatore;
- sono disponibili sette pranzi compatibili appartenenti ad almeno quattro
  famiglie culinarie;
- la valutazione della varietà non può creare eccezioni ai vincoli alimentari;
- i duplicati semantici restano rilevati dalla logica esistente;
- la varietà è best effort dopo sicurezza, validità strutturale e completezza.

Il rischio storico più evidente resta `lactose`: un pool sicuro ma troppo
ristretto può produrre menu quasi identici. Il controllo lo documenta come
rischio di rigidità e verifica la disponibilità di famiglie diverse; non
allarga il pool in modo non deterministico e non aumenta il budget.

## Combinazioni

Sono verificate con normalizzazione cumulativa, prompt cumulativo, allowlist
chiusa e piano finale di 21 pasti:

| Scenario | Esito |
| --- | --- |
| mediterranean + gluten + lactose | entrambe le esclusioni restano attive |
| vegan + gluten + nuts | pattern ed esclusioni restano cumulativi |
| vegetarian + milk + egg | latte e uova restano distinti e attivi |
| vegan + soy | combinazione coperta dal percorso parametrico |
| mediterranean + lactose | piano verificato con lactose |
| fish + peanut | entrambe le esclusioni restano attive |
| diabete + arachidi nelle note | rifiuto `422 UNSUPPORTED_ALLERGY_NOTE`, prima del modello |

Nessuna combinazione può rilassare silenziosamente un vincolo. Se il risultato
non è verificabile, il percorso deve produrre un errore tipizzato e non un
piano parziale.

## Correzioni P1 dimostrate

La matrice ha dimostrato quattro bypass lessicali del perimetro esistente:

1. `gallette di riso` senza dichiarazione non era trattato come prodotto a
   rischio glutine;
2. forme singolari della frutta a guscio, come `noce`, non erano sempre
   ricondotte a `nuts`;
3. alcune specie comuni (`sogliola`, `dentice`, `nasello`, `rana pescatrice`)
   non erano sempre bloccate da `fish`;
4. un marker `senza glutine` poteva rendere sicuro un secondo prodotto o una
   seconda occorrenza non dichiarata nella stessa frase.

Questi quattro casi sono stati corretti senza modificare le regole già
verificate per gluten, lactose, milk, normalizzazione canonica, duplicati
semantici, memoria inter-giorno, allowlist chiusa e validazione semantica.

Non sono state rilevate violazioni P0. I casi P2 relativi a rigidità o
ampiezza non sono stati risolti con espansioni speculative: sono documentati e
coperti da test di non regressione.

## Budget cumulativo

Il limite resta:

`MAX_MEAL_PLAN_MODEL_CALLS = 42`

| Percorso | Chiamate simulate attese | Note |
| --- | ---: | --- |
| scenario standard senza retry | 14 | generazione ordinaria |
| scenario solo lactose | 7 | colazioni deterministiche |
| gluten, milk o altro allergene standard | 14 | stesso percorso ordinario |
| retry malformed/constraint/varietà | cumulativo | non può superare 42 |
| budget esaurito | nessuna nuova chiamata | errore `AI_MODEL_CALL_BUDGET_EXHAUSTED`, nessun piano parziale |

I test usano un client OpenAI mockato. Il conteggio è asserito per ogni
scenario e ogni combinazione; nessuna richiesta esterna viene inviata.

## Test eseguiti

Comando principale:

```bash
npm run test:meal-plan-allergens
```

La suite include vincoli base, audit parametrico, varietà, varietà lactose,
budget, generazione mock e body reale della route. Sono inoltre richiesti
typecheck, estrazione in directory pulita, verifica dell’archivio e scansione
segreti prima della consegna.

## Classificazione

- **P0:** possibile violazione di allergene — nessun caso residuo rilevato.
- **P1:** interpretazione o normalizzazione errata — quattro casi corretti.
- **P2:** allowlist troppo restrittiva o menu fortemente ripetitivo —
  documentato e sottoposto a test, senza indebolire la sicurezza né aumentare
  il budget.
- **P3:** qualità o UX — fuori dal perimetro di questa consegna.
- **P4:** documentazione e test — report e matrice parametrica inclusi.

## Consegna

L’archivio consegnato è:

`familysync-meal-plan-allergens-audit-fixed-20260821.zip`

Contiene esclusivamente i file elencati in
`MEAL_PLAN_ALLERGEN_AUDIT_MANIFEST.txt`, senza `attached_assets`, build,
upload, file di ambiente, chiavi, credenziali o archivi annidati.

Non è stato eseguito alcun deploy.