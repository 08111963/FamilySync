# Correzione varietà pranzi con solo vincolo lattosio

**Data:** 21 agosto 2026  
**Stato:** verificata localmente; nessun deploy o publish eseguito.

## Causa precisa

`normalizeMealPlanConstraints({ allergies: "lattosio" })` produce correttamente
la sola esclusione canonica `lactose`. Il pool principale non era ristretto a
pasta, riso e patate: contiene già cereali, legumi, uova, pollo/tacchino,
pesci e verdure.

La ripetizione osservata derivava invece da tre lacune di varietà:

1. per piani con vincoli il tema giornaliero era volutamente generico
   (“ingredienti compatibili”), quindi non dava una struttura diversa ai
   pranzi;
2. il contesto tra giorni riportava solo conteggi aggregati di carboidrati e
   proteine di **pranzi e cene insieme**, senza dire al modello che
   `pasta + pomodoro + tonno` era già stato usato;
3. il controllo dei doppioni confrontava soltanto titoli identici. Cambiare
   “con insalata”, “con basilico” o “con olio” mascherava lo stesso pranzo.

Il validatore alimentare e i retry non erano la causa e non sono stati
allentati.

## Allowlist reale per `allergies: "lattosio"`

Il modello riceve una closed allowlist diversa per colazione e per pranzo/cena.
I valori sono ricavati con `compatibleMealIngredients()` durante la verifica.

| Pasto | Ingredienti disponibili |
|---|---|
| Colazione | mela, banana, pera, arancia, mandarino, pesca, albicocca, fragole, mirtilli, lamponi, uva, kiwi, caffè, cacao amaro, miele, marmellata, pane, pane/fette biscottate/biscotti senza glutine, gallette di riso, bevanda di riso, bevanda di cocco, yogurt vegetale di cocco, latte/yogurt/ricotta/mozzarella/formaggio **senza lattosio** |
| Pranzo | pasta, pane, couscous, farro, orzo, avena, cereali, riso/riso basmati/riso integrale, quinoa, polenta di mais, patate/patate dolci, ceci/lenticchie/fagioli/piselli, uova, pollo, tacchino, salmone, merluzzo, tonno, verdure, aromi e condimenti sicuri; inoltre latte/yogurt/ricotta/mozzarella/formaggio **senza lattosio** |
| Cena | Stessa closed allowlist del pranzo; i temi dedicati ruotano comunque pesce, carne bianca, legumi, uova e relative fonti di carboidrati. |

Il pool include quindi molte più famiglie di pranzo di pasta/riso/patate:
couscous, farro, orzo, cereali, quinoa, polenta, legumi, zuppe, piatti con
uova, pesci diversi e carne bianca.

### `lactose` non è `milk`

Il validatore già accetta una dicitura esplicita `senza lattosio` per
l’intolleranza al lattosio e la rifiuta per l’allergia alle proteine del latte.
La correzione ha allineato la closed allowlist a questa policy:

- con solo `lactose`, prodotti esplicitamente senza lattosio sono disponibili;
- con `milk`, tali prodotti non entrano mai nel pool;
- latte e latticini non qualificati restano vietati in titoli, ingredienti,
  descrizioni e passaggi.

Non sono stati aggiunti latticini generici o sostituti impliciti.

## Firma concettuale e memoria inter-blocco

È stata aggiunta una classificazione deterministica del pranzo:

```text
famiglia/carboidrato principale + base/preparazione + proteina principale
```

Esempio:

```text
pasta + pomodoro + tonno
```

Olio, aglio, basilico, verdure di contorno e insalata non cambiano la firma.
Zuppe e insalate sono considerate famiglie autonome solo quando sono il piatto
principale del titolo.

I giorni successivi ricevono un contesto compatto e non sensibile:

- firme di pranzo già usate;
- famiglie di pranzo già usate;
- carboidrati e proteine dei soli pranzi;
- istruzione di evitare una firma già vista.

Non viene inviato il JSON completo delle ricette precedenti.

## Regole di varietà per i pranzi `lactose`

Le regole restano best effort e non prevalgono mai sui vincoli sanitari:

- stessa firma di pranzo: massimo 2 volte a settimana;
- stessa firma: mai in due giorni consecutivi;
- stessa fonte di carboidrati pranzo: massimo 3 volte quando possibile;
- stessa proteina pranzo: massimo 2 volte quando possibile;
- con almeno sei pranzi: almeno quattro famiglie quando compatibili.

Il prompt chiarisce che cambiare solo contorno, olio, erbe o insalata non crea
un piatto nuovo e che la pasta non deve essere forzata.

## Test aggiunti

- Pool `lactose`: conferma la disponibilità di pasta, riso, couscous, farro,
  orzo, quinoa, polenta, patate, legumi, uova, carne bianca e pesci.
- Distinzione `lactose` / `milk`: un prodotto esplicitamente senza lattosio è
  ammesso nel primo caso e rifiutato nel secondo.
- Duplicati semantici: tre varianti di pasta-pomodoro-tonno condividono la
  medesima firma.
- Non duplicati: pasta, risotto, couscous e zuppa hanno firme/famiglie diverse.
- Fixture reale 7/7: rileva famiglia unica, pasta 7/7, tonno 6/7, firma
  ripetuta e giorni consecutivi.
- Generatore mock: una settimana `lactose` con sette pranzi su almeno quattro
  famiglie riceve il contesto di firma dal secondo giorno e resta a sette
  chiamate modello.
- Sono rieseguiti anche vincoli senza glutine, glutine + lattosio, vegetariana,
  vegana e allergia al latte tramite le suite dei constraint e del generatore.

## Confronto

| Controllo | Prima | Dopo |
|---|---|---|
| Pasta a pranzo | Poteva raggiungere 7/7. | Best effort massimo 3 e non forzata. |
| Stesso pattern pranzo | Piccole variazioni del titolo passavano. | Firma concettuale, massimo 2 e mai consecutiva. |
| Stessa proteina | Tonno/pollo potevano ricorrere senza memoria pranzo. | Conteggio dedicato, best effort massimo 2. |
| Famiglie pranzo | Nessuna misura specifica. | Almeno 4 con settimana e pool compatibili. |
| Sicurezza lattosio | Attiva. | Invariata; solo prodotti con dicitura esplicita. |
| Allergia `milk` | Separata dal validatore. | Separata anche dalla closed allowlist. |
| Chiamate OpenAI | 14 standard, 7 con colazioni lactose deterministiche. | Invariate: 14 standard, 7 `lactose`. |

## Verifica

Comandi previsti ed eseguiti:

```text
npm run typecheck
npm run test:ai
npx tsx server/__tests__/meal-plan-constraints.test.ts
npx tsx server/__tests__/meal-plan-generation.test.ts
npx tsx server/__tests__/meal-plan-request-body.test.ts
npx tsx server/__tests__/meal-plan-replace.test.ts
npx tsx server/__tests__/meal-plan-variety.test.ts
npx tsx server/__tests__/meal-plan-lactose-variety.test.ts
git diff --check
```

La suite ufficiale AI, inclusi i nuovi test, ha eseguito **105 test passati,
0 falliti**. Con gli **11 test HTTP/DB** di sostituzione del piano, le
verifiche eseguite sono **116 passati, 0 falliti**. Il typecheck è pulito.
Non è stata aggiunta alcuna chiamata AI dedicata alla varietà, né aumentato
`MAX_CONSTRAINT_GENERATION_ATTEMPTS`.

## Esclusioni deliberate

- Nessuna modifica UI.
- Nessun deploy, publish, migrazione, secret o database dump.
- Nessuna chiamata finale “riscrivi il piano”.