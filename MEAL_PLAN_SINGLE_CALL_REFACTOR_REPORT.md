# Refactor Piano Pasti — chiamata AI unica

Data: 22 agosto 2026

## Obiettivo

Il Piano Pasti settimanale viene generato con un unico JSON completo, senza
sette richieste giornaliere parallele. In caso di errore deterministico
recuperabile è consentita una sola correzione mirata dell'intera settimana.
Non è stato modificato il provider o il routing AI e non è stato eseguito
alcun deploy.

## Risultato

- Generazione normale: **1 chiamata applicativa** per tutti i giorni e i tipi
  di pasto richiesti.
- Recupero: **al massimo 1 repair**, con il JSON del piano precedente e le
  correzioni locali determinate dal validatore.
- Nessun repair per singolo pasto e nessun terzo tentativo.
- `MAX_MEAL_PLAN_MODEL_CALLS` resta a **28** come cap globale di difesa in
  profondità; il costo interno di ogni settimana è 1.
- `max_completion_tokens` della richiesta full-week è 7000 per contenere
  21 ricette complete senza troncamento.
- Il blueprint locale decide prima della chiamata temi, famiglie dei pranzi,
  proteine/preparazioni, fonti di carboidrati, varietà e carne rossa.
- La validazione locale resta fail-closed: il piano non viene consegnato se è
  incompleto, incompatibile, non strutturato o privo della carne rossa richiesta
  dai profili mediterranei compatibili.
- I nove profili dieta chiusi restano la fonte del catalogo; `allergies` legacy
  non viene usato per creare restrizioni.
- Ogni evento dello stream include `requestId` e `dietProfile`. Il client
  ignora eventi con identificatore o profilo diverso dalla generazione attiva,
  anche per il piano alternativo.
- Il monitor di regressione usa un profilo chiuso senza glutine e il suo budget
  è stato riallineato a 1 chiamata + 1 repair.
- La web-build servita dall'anteprima è stata rigenerata e il backend riavviato.

## Verifiche eseguite

Passate:

1. `npm run typecheck`
2. `npm run test:ai`
3. `npx tsx --test server/__tests__/meal-plan-allergen-monitor.test.ts server/__tests__/meal-plan-latency-monitor.test.ts server/__tests__/meal-plan-latency-alert-state.test.ts`
4. `npx tsx --test e2e/meal-plan-diet-selector.test.ts`
5. `git diff --check`
6. Revisione architetturale del diff: nessun difetto bloccante rilevato.
7. Browser smoke test mobile non distruttivo: route raggiungibile e nessun crash
   client; senza login la route porta correttamente alla welcome page.

La suite dedicata copre:

- contratto full-week da 21 pasti e blueprint;
- una sola chiamata in condizioni normali;
- repair globale con JSON precedente e limite di due chiamate;
- fallimento senza terza chiamata;
- tutti i nove profili chiusi;
- vincoli vegan, gluten-free, lactose-free, halal e carne rossa;
- budget applicativo di una sola chiamata;
- selettore UI, `requestId`, profilo e risposta stale.

## Artefatti

- `MEAL_PLAN_SINGLE_CALL_REFACTOR_REPORT.md` — questo report.
- `MEAL_PLAN_SINGLE_CALL_REFACTOR_MANIFEST.txt` — contenuto e verifiche
  dell'archivio.
- `familysync-meal-plan-single-call-refactor-20260822.zip` — archivio minimale,
  senza segreti, database, build generate o file di ambiente.
