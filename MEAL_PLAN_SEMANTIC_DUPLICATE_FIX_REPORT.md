# Correzione duplicati semantici dei pranzi

## Caso osservato

In produzione due pranzi della stessa settimana potevano essere trattati come
diversi perché il titolo cambiava leggermente:

```text
Risotto al limone con salmone e fagiolini
Riso al limone con salmone e zucchini saltati
```

Prima il checker distingueva soprattutto famiglia, base e proteina e segnalava
un pattern ripetuto soltanto dalla terza occorrenza. Il paio sopra poteva quindi
non generare un advisory né una riparazione locale.

Ora entrambi producono la stessa firma:

```text
rice + lemon + salmon + grain_main
```

e la seconda occorrenza è un duplicato semantico.

## Regole di normalizzazione

La normalizzazione si applica esclusivamente al controllo di varietà: non
cambia mai titolo, descrizione, ingredienti o testo visibile all'utente.

| Dimensione | Esempi normalizzati |
| --- | --- |
| Macro-carboidrato | riso, risotto, riso basmati, riso integrale → `rice`; pasta, spaghetti, penne, fusilli → `pasta` |
| Profilo/preparazione | limone → `lemon`; pomodoro/passata/sugo → `tomato`; pesto → `pesto`; umido → `stew` |
| Proteina principale | salmone → `salmon`; tonno → `tuna`; pollo → `chicken`; ceci/lenticchie/fagioli → `legumes` |
| Struttura del pasto | riso/risotto/cereali/couscous/quinoa → `grain_main`; pasta → `pasta_main`; legumi → `legume_main` |

Contorni e garnish come insalata, pomodori laterali, fagiolini, zucchine,
broccoli, rucola, olio, basilico, aglio e prezzemolo non rendono un piatto
nuovo quando macro-base, profilo e proteina restano uguali.

## Comportamento

- Il checker continua a distinguere famiglia, base/preparazione, proteina e
  firma semantica.
- Una firma semantica ripetuta due volte genera un advisory esplicito.
- Anche una coppia proteina + profilo ripetuta due volte viene segnalata come
  best effort quando il pool offre alternative.
- Il contesto dei giorni successivi contiene `SEMANTIC LUNCH SIGNATURES USED`
  e `DO NOT REPEAT`, senza inviare titoli o ricette complete.
- La pianificazione locale mantiene la rotazione esistente delle famiglie e
  aggiunge un profilo-obiettivo compatibile (proteina principale +
  preparazione) per ogni pranzo.
- Un duplicato semantico con un titolo di ricetta realmente dichiarato entra
  nella riparazione locale già esistente. Non viene aggiunta alcuna
  rigenerazione completa della settimana.

I titoli tecnici o non descrittivi restano advisory: una riparazione locale
richiede che il titolo dichiari davvero macro-base e proteina, così fixture o
output non descrittivi non consumano chiamate solo per cosmetica.

## Regressioni coperte

Le coppie seguenti sono ora equivalenti:

```text
Risotto al limone con salmone e fagiolini
Riso al limone con salmone e zucchine

Pasta al pomodoro con tonno e insalata
Spaghetti al pomodoro con tonno e verdure

Riso con pollo e zucchine
Risotto con pollo e zucchine
```

Restano differenti:

```text
Risotto al limone con salmone
Riso con ceci e verdure

Pasta al pomodoro con tonno
Pasta con crema di zucchine e pollo
```

La settimana reale fornita dal tester segnala il collegamento tra i pranzi 2 e
5. Un test di generazione verifica inoltre che il duplicato
`rice + lemon + salmon + grain_main` usa una sola riparazione locale e non
rigenera l'intera settimana.

## Regressione mediterranea + glutine

La suite ora copre il percorso reale `diet = "mediterranea"` e
`allergies = "glutine"` con il pool chiuso gluten-free:

1. **Piano valido al primo tentativo.** Il mock restituisce 21 pasti completi
   e compatibili; il generatore effettua le 14 chiamate giornaliere previste,
   non rileva violazioni gluten e il validatore finale restituisce un elenco
   vuoto.
2. **Recovery da piano incompatibile.** Il primo tentativo restituisce pasta
   normale; il validatore gluten lo rifiuta e il generatore avvia un solo
   recovery completo. Il secondo piano è verificato gluten-safe. Totale:
   28 chiamate, uguale al cap e mai superiore.
3. **Duplicato semantico gluten-safe.** Sette pranzi con la stessa firma
   `pasta + tomato + tuna + pasta_main` restano un advisory di varietà: il
   piano gluten-safe viene consegnato con 14 chiamate e non avvia alcuna
   rigenerazione completa per la sola varietà.
4. **Famiglie-obiettivo compatibili.** Ogni target pranzo emesso dal planner
   viene confrontato con il pool gluten-free: pasta senza glutine, riso,
   legumi, couscous di mais senza glutine, patate/polenta, quinoa e zuppa
   possiedono almeno un ingrediente consentito nel prompt.

Questi test non riducono il validatore gluten e non modificano il budget.

## Verifica

Comandi eseguiti:

```text
npm run typecheck
npm run test:meal-plan-allergens
npm run test:ai
git diff --check
```

Risultato:

- Typecheck: superato.
- Test allergeni: superati, incluso audit parametrico dei 15 allergeni.
- Suite AI: superata; 30 test di generazione Piano Pasti e tutte le suite
  collegate senza fallimenti.
- Test semantici: 8 superati, incluse coppie parametriche e settimana reale.
- Hard cap invariato: `MAX_MEAL_PLAN_MODEL_CALLS = 28`.
- Percorso normale mock: 14 chiamate; il caso di duplicato semantico usa una
  sola riparazione locale (15 chiamate complessive), sempre entro 28.
- Le prove di budget coprono anche il limite cumulativo di 28 chiamate.
- Nessuna modifica a allergeni, normalizzazione dei vincoli, allowlist,
  validazione di sicurezza, quote, UI, database, rotazione delle famiglie,
  `MAX_LOCAL_VARIETY_REPAIRS` o route.

Non sono state effettuate chiamate OpenAI reali né deploy.