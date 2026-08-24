# Refactor profili dieta — Piano Pasti AI

## Catalogo attivo

Il Piano Pasti usa un solo campo `dietProfile` con un catalogo chiuso di
**cinque profili**. Il selettore Expo/web mostra soltanto queste scelte:

| Identificatore | Etichetta italiana |
| --- | --- |
| `mediterranean` | Mediterranea |
| `vegetarian` | Vegetariana |
| `vegan` | Vegana |
| `gluten_free` | Senza glutine |
| `lactose_free` | Senza lattosio |

Equilibrata, Leggera e Sportiva non sono profili attivi e non compaiono nel
menu.

## Prompt e compatibilità legacy

I prompt alimentari attivi sono costruiti soltanto per:

`mediterranean`, `vegetarian`, `vegan`, `gluten_free`, `lactose_free`.

Prima di costruire qualsiasi richiesta al provider, i chiamanti HTTP e interni
passano dalla stessa normalizzazione:

- `balanced` / Equilibrata → `mediterranean`;
- `light` / Leggera → `mediterranean`;
- `sport` / Sportiva → `mediterranean`;
- le varianti mediterranee senza glutine e senza lattosio → il rispettivo
  profilo esclusivo;
- `vegan` / Vegana → `vegan`.

La normalizzazione è applicata anche quando il valore arriva nel campo legacy
`diet`. Un valore non riconosciuto viene rifiutato prima della chiamata AI:
non può produrre un prompt permissivo o un blueprint dedicato.

Di conseguenza, OpenAI non riceve mai `balanced`, `light`, `sport`,
Equilibrata, Leggera o Sportiva come profilo o come istruzione di dieta.
Questi nomi restano esclusivamente nei test di compatibilità e nella
normalizzazione degli input già pubblicati.

## Regole dei cinque profili

- **Mediterranea** usa la distribuzione mediterranea e richiede soltanto qui
  almeno una fonte di carne rossa nella settimana. Le quote editoriali restano
  advisory.
- **Vegetariana** vieta carne e pesce, ma consente uova, latticini, cereali,
  legumi e verdure.
- **Vegana** vieta carne, pesce, uova, miele, latticini e ingredienti animali
  meno evidenti; consente sostituti vegetali espliciti.
- **Senza glutine** applica il vincolo sul glutine e usa ingredienti
  naturalmente privi di glutine o prodotti dichiarati senza glutine.
- **Senza lattosio** vieta i latticini ordinari ma consente pasta, pane e
  cereali normali.

Senza glutine e senza lattosio sono profili indipendenti: nessuno dei due
eredita automaticamente l'altro vincolo.

## Pipeline e garanzie

La pipeline applica:

`input legacy → profilo canonico → blueprint/prompt attivo → validatore finale`

La generazione produce una settimana completa di 21 pasti, con un massimo
globale di 28 chiamate al modello e al massimo un repair. I profili senza
glutine e senza lattosio mantengono inoltre sette colazioni locali e quattordici
slot generati dall'AI.

Il controllo finale è fail-closed per profilo, completezza del piano,
ingredienti concreti e vincoli alimentari. Varietà, qualità mediterranea,
colazioni non perfettamente italiane e prodotti integrali inattesi restano
segnalazioni advisory, non creano prompt per profili ritirati.

## Verifiche

- `npm run typecheck`
- `npm run test:ai`
- `E2E_BASE_URL=http://127.0.0.1:5000 npx tsx --test e2e/meal-plan-diet-selector.test.ts`
- `git diff --check`

Il test AI verifica anche che i valori legacy `balanced`, `light` e `sport`,
ricevuti sia come `dietProfile` sia come `diet`, vengano inviati al provider
soltanto come `mediterranean`.