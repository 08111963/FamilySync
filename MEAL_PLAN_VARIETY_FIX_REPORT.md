# Correzione varietà Piano Pasti

**Data:** 21 agosto 2026  
**Stato:** verificata localmente; nessun deploy o publish eseguito.

## Obiettivo e confini

Questa correzione migliora esclusivamente la varietà e la naturalezza dei
Piani Pasti. La normalizzazione canonica, la closed allowlist, JSON Schema,
Zod, validazione semantica, distinzione `gluten` / `lactose` / `milk` e
`MAX_CONSTRAINT_GENERATION_ATTEMPTS = 2` non sono stati indeboliti o ampliati.

## Modifiche applicate

- Il prompt mediterraneo senza glutine non presenta più riso, quinoa, polenta
  e patate come le sole fonti amidacee: include anche pasta senza glutine,
  couscous di mais senza glutine, gnocchi senza glutine e pane senza glutine.
- I temi giornalieri gluten-free danno realmente spazio a pasta gluten-free e
  alle altre alternative sicure già presenti nell’enum strutturato.
- Il prompt chiede varietà settimanale “best effort”: almeno quattro fonti di
  carboidrati quando compatibile, stessa fonte non oltre tre volte quando sono
  disponibili alternative, e rotazione delle proteine senza dominanza di un
  singolo pesce come il salmone.
- I blocchi giornalieri successivi ricevono soltanto un riepilogo compatto
  delle categorie già usate (carboidrati e proteine), non il JSON delle ricette.
  Le due richieste dello stesso giorno rimangono parallele.
- Il prompt evita di aggiungere “senza glutine” ai titoli di piatti
  naturalmente privi di glutine; la dicitura resta obbligatoria solo per
  identificare un prodotto sostitutivo.
- È stato aggiunto l’helper puro `meal-plan-variety`, che segnala monotonia
  evidente senza trasformarla in un errore di sicurezza e senza chiamare AI.

## Confronto prima/dopo

| Aspetto | Prima | Dopo | Test |
|---|---|---|---|
| Pasta GF utilizzabile | Presente nell’allowlist ma poco favorita da prompt e temi. | Esplicitamente disponibile nel prompt, nell’enum e in temi mediterranei GF. | Generatore mediterranea + glutine |
| Ripetizione riso | Riso e risotti venivano suggeriti ripetutamente. | Prompt e contesto dei blocchi preferiscono fonti meno usate; un riso dominante è segnalato dall’helper. | Fixture monotono |
| Ripetizione salmone | Nessuna misura specifica oltre ai titoli duplicati. | Rotazione proteica nel prompt; salmone ripetuto 5 volte è rilevato. | Fixture monotono |
| Numero fonti carboidrati | Nessun controllo qualitativo sui gruppi presenti. | Obiettivo di almeno 4 fonti quando possibile e rilevamento di bassa varietà effettiva. | Fixture monotono e helper |
| Sicurezza glutine | Validazione e allowlist attive. | Invariata: pasta/pane/couscous/farro/orzo normali restano esclusi. | Vincoli + generatore |
| Retry OpenAI | Massimo vincoli = 2. | Invariato: nessuna chiamata aggiunta per la varietà. | Generatore: 14 chiamate |

## File modificati

- `server/lib/openai.ts` — prompt, temi gluten-free e contesto tra blocchi.
- `server/lib/meal-plan-variety.ts` — helper puro per conteggi e advisory di
  varietà.
- `server/__tests__/meal-plan-generation.test.ts` — prompt, allowlist,
  contesto e budget invariato.
- `server/__tests__/meal-plan-variety.test.ts` — fixture monotono e piano
  normalmente alternato.
- `package.json` — include il test di varietà nella suite ufficiale AI.
- `MEAL_PLAN_VARIETY_FIX_REPORT.md`
- `MEAL_PLAN_VARIETY_FIX_MANIFEST.txt`

Nello ZIP sono inclusi anche i constraint helper e i relativi test, perché
restano la barriera di sicurezza che la correzione di varietà non modifica.

## Test aggiunti

- Prompt mediterranea + glutine: alternative gluten-free presenti, nessuna
  formulazione che limiti le fonti a riso/quinoa/polenta/patate.
- Allowlist pranzo/cena: pasta senza glutine, pasta di riso, pasta di mais e
  pane senza glutine disponibili; fonti con glutine normali escluse dai test
  dei vincoli già inclusi.
- Contesto compatto nei blocchi successivi e 14 chiamate modello invariati.
- Fixture con molto riso, cinque salmoni, patate, quinoa, polenta e zero pasta
  GF: rileva ripetizione proteica e bassa varietà, ma resta sicuro per glutine.
- Piano equilibrato: una singola ripetizione non è segnalata.

## Verifica

Comandi eseguiti:

```text
npm run typecheck
npm run test:ai
npx tsx server/__tests__/meal-plan-constraints.test.ts
npx tsx server/__tests__/meal-plan-generation.test.ts
npx tsx server/__tests__/meal-plan-replace.test.ts
npx tsx server/__tests__/meal-plan-variety.test.ts
git diff --check
```

La suite ufficiale AI include 100 test; con i 11 test HTTP/DB del percorso
Piano Pasti, il totale verificato è **111 passati, 0 falliti**. Il typecheck è
pulito.

Il numero massimo di model call resta **14** per un piano standard a tre pasti
(due blocchi per ciascuno dei 7 giorni) e **7** quando la colazione al lattosio
è deterministica. Non è stata aggiunta alcuna chiamata OpenAI né sono stati
aumentati retry o limiti.

## Esclusioni deliberate

- Nessuna modifica della UI.
- Nessun deploy, publish, secret, migrazione o modifica del database.
- Nessun retry AI supplementare per migliorare la varietà.