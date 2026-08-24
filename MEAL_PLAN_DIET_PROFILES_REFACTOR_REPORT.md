# Refactor profili dieta — Piano Pasti AI

> **Stato storico — non descrive il runtime corrente.** Questo report documenta
> il refactor dei profili indipendenti che è stato annullato con il rollback
> della pipeline Piano Pasti. Il runtime usa di nuovo il comportamento del
> punto funzionante precedente: il menu resta a sette profili, mentre Senza
> glutine e Senza lattosio seguono la generazione Mediterranea della versione
> ripristinata. Per l'elenco dei file coinvolti, fare riferimento allo ZIP di
> rollback e al riepilogo di consegna.

## Risultato definitivo

Il Piano Pasti usa un solo campo `dietProfile` con un catalogo chiuso di
**sette profili**. Il selettore Expo/web mostra soltanto queste sette scelte:

| Identificatore | Etichetta italiana |
| --- | --- |
| `mediterranean` | Mediterranea |
| `balanced` | Equilibrata |
| `vegetarian` | Vegetariana |
| `light` | Leggera |
| `sport` | Sportiva |
| `gluten_free` | Senza glutine |
| `lactose_free` | Senza lattosio |

Non sono profili attivi e non compaiono nel menu: Mediterranea senza glutine,
Mediterranea senza lattosio, Vegetariana senza glutine, Vegana, Pescetariana,
Low carb e Halal.

## Regole dei sette profili

- **Mediterranea** è l'unico profilo con rotazioni, quote editoriali e
  obbligo di almeno una fonte di carne rossa nella settimana. Le quote
  editoriali restano advisory; l'obbligo della carne rossa è invece verificato
  dal percorso deterministico.
- **Equilibrata** applica varietà generale senza ereditare quote o obbligo
  Mediterranei.
- **Leggera** privilegia preparazioni semplici e digeribili, senza trasformare
  il profilo in un divieto generale di carne.
- **Sportiva** richiede proteine e carboidrati complessi concreti in ogni
  pranzo e cena; il blueprint può usare, tra le altre fonti, pollo, tacchino,
  manzo e pesce.
- **Vegetariana** vieta carne e pesce. Consente uova, latticini, cereali,
  legumi e verdure.
- **Senza glutine** applica esclusivamente il vincolo sul glutine e usa
  ingredienti naturalmente privi di glutine o prodotti dichiarati senza
  glutine. Carne rossa, carne bianca, pesce e uova restano ammessi.
- **Senza lattosio** vieta i latticini ordinari ma consente pasta, pane e
  cereali normali. Carne rossa, carne bianca, pesce e uova restano ammessi.

Di conseguenza, tra i sette profili attivi, **carne rossa e carne bianca sono
ammesse in Equilibrata, Leggera, Sportiva, Senza glutine e Senza lattosio**.
Carne e pesce sono vietati solo in Vegetariana. L'assenza dell'obbligo di carne
rossa Mediterranea negli altri profili non costituisce un divieto.

## Compatibilità con dati precedenti

Le vecchie voci sono gestite soltanto come input legacy o compatibilità, non
come nuove scelte del prodotto:

- `Mediterranea senza glutine` e le varianti equivalenti vengono normalizzate
  a `gluten_free`;
- `Mediterranea senza lattosio` e le varianti equivalenti vengono normalizzate
  a `lactose_free`;
- `Vegetariana senza glutine`, `Vegana`, `Pescetariana`, `Low carb`, `Halal` e
  valori analoghi non vengono convertiti in un profilo attivo: richiedono una
  nuova selezione esplicita e non avviano la generazione;
- in particolare, **Vegana resta una dieta legacy/non rappresentabile e non
  viene mai trattata come un profilo che ammette carne**. Se verrà introdotta
  in futuro, dovrà mantenere carne e pesce vietati insieme agli altri vincoli
  vegani;
- il campo legacy `allergies` può essere ricevuto per compatibilità, ma non
  viene estratto, salvato o inoltrato al modello come vincolo del Piano Pasti.

I vecchi metadata non sono mostrati all'utente e non possono rilassare i
vincoli del catalogo corrente.

## Pipeline e garanzie

La pipeline applica:

`profilo → catalogo compatibile → prompt/schema → validatore finale`

La generazione produce una settimana completa di 21 pasti, con un massimo
globale di 28 chiamate al modello e al massimo un repair. I profili Senza
glutine e Senza lattosio mantengono inoltre le sette colazioni locali e i
quattordici pasti generati dall'AI, senza ereditare regole Mediterranee.

Il controllo finale è fail-closed per profilo, completezza del piano,
ingredienti concreti e vincoli alimentari. La carne rossa richiesta da
Mediterranea viene pianificata e verificata prima della consegna; la sua
assenza non viene trasformata in un divieto per gli altri profili.

## Voce e contenuti

- La dettatura riconosce le espressioni dei sette profili.
- Le diete storiche o non rappresentabili, inclusa Vegana, richiedono una
  scelta manuale invece di essere interpretate in modo permissivo.
- Allergie, intolleranze e condizioni mediche nelle note non vengono convertite
  in vincoli generati dall'AI.
- Guida e disclaimer invitano a verificare le etichette e a consultare un
  professionista per esigenze individuali.

## Verifiche

- `npm run typecheck`
- `npm run test:ai`
- `npx tsx --test server/__tests__/meal-plan-diet-profiles.test.ts`
- `git diff --check`

Nessun deploy, pubblicazione o migrazione database è stato eseguito per questo
allineamento documentale.