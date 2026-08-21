# Audit sistematico: allergeni e intolleranze nel Piano Pasti

## Scopo e confini

Questo archivio documenta il controllo parametrico dei vincoli già supportati dal Piano Pasti. Non aggiunge allergeni, diete, database, migrazioni, deploy o chiamate OpenAI reali.

Il percorso verificato è quello effettivo dell'app:

1. la schermata Piano Pasti invia `weekStartDate` e l'oggetto `preferences` allo stream `POST /api/ai/:familyId/weekly-meal-plan/stream`;
2. la route applica `prepareMealPlanPreferences`, compresi consenso salute, body strict e rifiuto delle note mediche non verificabili;
3. le preferenze sono normalizzate, inserite nel prompt e nell'enum chiuso degli ingredienti;
4. il client OpenAI è sostituito da un mock locale;
5. ogni titolo, descrizione, nota, ingrediente e passaggio del piano finale viene ri-validato prima della consegna.

## Inventario osservato

| Vincolo canonico | Esempio di input riconosciuto | Termine vietato testato | Marker/ingrediente sicuro testato |
| --- | --- | --- | --- |
| `gluten` | `glutine` | gallette di riso | gallette di riso senza glutine |
| `lactose` | `lattosio` | ricotta | yogurt senza lattosio |
| `milk` | `latte` | caseina | yogurt vegetale di cocco |
| `egg` | `uova` | maionese | maionese vegana |
| `peanut` | `arachidi` | burro di arachidi | riso |
| `nuts` | `noce` | noce | riso |
| `fish` | `pesce` | sogliola | riso |
| `soy` | `soia` | tofu | riso |
| `sesame` | `sesamo` | tahini | riso |
| `celery` | `sedano` | sedano | riso |
| `mustard` | `senape` | senape | riso |
| `lupin` | `lupini` | lupino | riso |
| `sulfites` | `solfiti` | anidride solforosa | riso |
| `shellfish` | `crostacei` | gamberetti | riso |
| `molluscs` | `molluschi` | vongole | riso |

La colonna “sicuro” descrive solo il testo gestito dal validatore: non è una certificazione clinica o di contaminazione crociata oltre a quanto dichiarato esplicitamente nel testo.

## Esito della matrice

Il test `server/__tests__/meal-plan-allergen-audit.test.ts` esegue, per tutti i 15 vincoli:

- normalizzazione e presenza della corrispondente esclusione nel prompt;
- termine vietato in **titolo, descrizione, note, elenco ingredienti e passaggi**;
- marker sicuro in quegli stessi cinque campi;
- un marker per un altro prodotto o una seconda occorrenza nella stessa frase (ad esempio `pasta senza glutine con pasta`) resta un errore in tutti i cinque campi;
- pool principale non vuoto, con ogni ingrediente ri-validato dal controllo indipendente;
- sette pranzi compatibili in almeno quattro famiglie culinarie, senza trasformare la varietà in un'eccezione di sicurezza;
- body della route, mock del modello, enum degli ingredienti, piano finale di 21 pasti e conteggio chiamate.

Le combinazioni verificate sono:

| Combinazione | Esito |
| --- | --- |
| mediterranea + glutine + lattosio | piano verificato con entrambe le esclusioni |
| vegana + glutine + frutta a guscio | piano verificato con pattern ed esclusioni cumulativi |
| vegetariana + latte + uova | piano verificato con entrambi gli allergeni |
| pesce + arachidi | piano verificato con entrambi gli allergeni |
| diabete + arachidi nelle note | `422 UNSUPPORTED_ALLERGY_NOTE`, prima di ogni mock/modello |

## Correzioni P1 incluse

La matrice ha dimostrato e bloccato quattro bypass lessicali del perimetro già esistente:

1. `gallette di riso` senza dichiarazione non era trattato come prodotto a rischio glutine; ora è ammesso solo come `gallette di riso senza glutine`.
2. le forme singolari della frutta a guscio, come `noce`, non venivano sempre ricondotte al vincolo `nuts`; ora sono normalizzate e validate come tali.
3. la regola `fish` non riconosceva alcune specie comuni (`sogliola`, `dentice`, `nasello`, `rana pescatrice`); ora le rifiuta per il vincolo pesce.
4. un marker `senza glutine` associato a un prodotto poteva rendere sicuro un secondo prodotto oppure una seconda occorrenza non dichiarata nella stessa frase; ora il marker deve qualificare la singola occorrenza intercettata.

Non sono state rilevate regressioni P0. Nessuna correzione modifica il budget, le chiamate esterne, lo schema dati o la varietà come regola di sicurezza.

## Costi e budget

Tutte le generazioni di audit usano `__setOpenAiClientForTest`: non viene inviata alcuna richiesta OpenAI.

| Percorso mock senza retry | Chiamate simulate asserite | Limite assoluto |
| --- | ---: | ---: |
| allergene standard, tre pasti/giorno | 14 | 42 |
| solo lattosio, colazioni deterministicamente sicure | 7 | 42 |
| qualunque retry/variante | conteggiato cumulativamente | 42 |

Il test asserisce 14 chiamate per gli scenari standard e 7 per gli scenari con colazioni deterministiche senza lattosio, oltre a `calls.length <= MAX_MEAL_PLAN_MODEL_CALLS`; il valore centralizzato resta `42`. Un budget insufficiente restituisce `AI_MODEL_CALL_BUDGET_EXHAUSTED` e non consegna un piano parziale.

## Comandi e risultati esatti

Per ripetere il controllo:

```bash
npm run test:meal-plan-allergens
```

Il comando esegue sette file di test: vincoli base, matrice allergeni, varietà generale, varietà lattosio, budget del modello, generazione mock e body della route. L'esito atteso è: tutti i test passano, zero test falliti, zero chiamate OpenAI reali.

Per produrre l'archivio controllato:

```bash
bash scripts/export-consegna.sh familysync-audit-allergeni-piano-pasti.zip
unzip -t familysync-audit-allergeni-piano-pasti.zip
unzip -l familysync-audit-allergeni-piano-pasti.zip | grep -E 'docs/audit-allergeni-piano-pasti.md|server/__tests__/meal-plan-allergen-audit.test.ts'
```

Lo script di export crea lo ZIP, esclude file e directory sensibili, estrae l'archivio in una cartella temporanea e cerca chiavi private, valori di segreti e credenziali prima di completare.