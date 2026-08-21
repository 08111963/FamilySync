# Correzione della varietà generale dei pranzi

**Data:** 21 agosto 2026  
**Stato:** verificata localmente; nessun deploy, publish, migrazione o chiamata
OpenAI reale eseguita.

## Problema osservato

Con dieta mediterranea e nessuna allergia era possibile ricevere pasta, spesso
al pomodoro, per sei o sette pranzi. Piccole differenze come insalata, olio,
basilico o pomodori diversi potevano rendere diverso il titolo senza rendere
diverso il pranzo.

La causa non era il pool di ingredienti: quello standard offre pasta, riso,
legumi, couscous, farro/orzo, patate, polenta e quinoa. Il problema era di
orchestrazione:

1. i temi mediterranei suggerivano ancora pasta molto spesso;
2. ogni giorno vedeva una memoria descrittiva, ma non una famiglia-obiettivo
   deterministica;
3. il controllo conosceva la firma completa, ma non esponeva separatamente il
   limite della famiglia e della base/preparazione.

## Correzione

### Rotazione locale compatibile

Prima di ogni settimana viene costruita una sequenza deterministica di famiglie
di pranzo dal pool già compatibile con i vincoli esistenti. La prima rotazione
con il pool mediterraneo standard è:

```text
pasta → risotto/riso → piatto di legumi → couscous →
cereale in chicco → patate/polenta → quinoa
```

Il Piano B usa una rotazione traslata: risotto/riso → legumi → couscous →
cereale → patate/polenta → quinoa → pasta.

Il generatore non crea ingredienti nuovi e non modifica la closed allowlist:
la rotazione considera soltanto famiglie la cui base è presente nel pool
compatibile. Se il pool è più ristretto, le famiglie disponibili vengono
riutilizzate in modo bilanciato; la sicurezza resta sempre prioritaria.

Ogni richiesta giornaliera per pranzo riceve quindi:

- `OBIETTIVO FAMIGLIA PRANZO DEL GIORNO`;
- una memoria compatta dei giorni già creati;
- la regola esplicita che un condimento o contorno non può sostituire la
  famiglia-obiettivo.

Questa guida usa le stesse 14 chiamate standard (oppure 7 nel percorso con
colazioni lactose deterministiche): non esiste un retry settimanale dedicato
alla sola varietà.

### Checker semantico

Il checker ora valuta tre livelli distinti:

| Livello | Esempio | Perché conta |
| --- | --- | --- |
| Famiglia | `pasta` | Sei paste restano monotone anche con proteine diverse. |
| Base/preparazione | `pasta + pomodoro` | Pasta al pomodoro con tonno e con pollo condivide la stessa base. |
| Firma completa | `pasta + pomodoro + tonno` | Individua il piatto sostanzialmente identico. |

Olio, erbe, insalata e verdure minori non cambiano nessuno di questi livelli.
La base/preparazione viene letta dal titolo del piatto: un pomodoro o
un'insalata presenti soltanto tra gli ingredienti non possono ridefinire una
pasta al pesto.
Il checker segnala esplicitamente:

- meno di quattro famiglie in almeno sei pranzi;
- una famiglia oltre tre volte;
- una base oltre due volte;
- una firma completa oltre due volte o in giorni consecutivi;
- una fonte di carboidrati pranzo oltre tre volte.

I segnali restano advisory per non far prevalere un obiettivo estetico sulla
sicurezza o sul budget: un piano completo e sicuro non innesca una nuova
settimana AI solo per varietà. Tuttavia il fixture con sei paste viene ora
classificato in modo inequivocabile come monotono e la generazione viene guidata
prima che quel risultato venga prodotto.

### Memoria tra i giorni

Dal secondo pranzo il prompt riceve soltanto categorie aggregate:

```text
LUNCH FAMILY COUNTS
LUNCH BASE COUNTS
LUNCH PROTEIN COUNTS
AVOID NEXT
```

Insieme alle firme già usate, questi conteggi impediscono che il modello
consideri una guarnizione una nuova ricetta. Non viene inviato il JSON completo
delle ricette precedenti.

## Confronto

| Aspetto | Prima | Dopo |
| --- | --- | --- |
| Mediterranea a pranzo | Temi inclini a ripetere pasta. | Famiglia-obiettivo locale per ogni giorno. |
| Pasta 6/7 | Poteva passare come semplice varietà di titoli. | Segnalata per famiglia, base, carboidrato e varietà insufficiente. |
| Pomodoro con contorni diversi | Poteva sembrare una ricetta nuova. | Stessa base semantica. |
| Pool ristretto | Nessuna pianificazione esplicita. | Rotazione solo tra famiglie realmente compatibili, con degrado bilanciato. |
| Allergeni e vincoli | Già obbligatori. | Invariati e prioritari. |
| Chiamate modello | 14 standard, 7 lactose. | Invariate; cap globale ancora 28. |
| Repair locali | Massimo 3. | Invariato; nessun retry settimanale per varietà. |

## Regressioni aggiunte

- Rotazione deterministica di sette famiglie dal pool standard.
- Fixture mediterraneo monotono: sei paste al pomodoro con contorni diversi
  conserva famiglia e base uguali e genera gli advisory attesi.
- Fixture di sette pranzi con famiglie, basi e proteine alternate, senza falsi
  positivi di duplicato semantico.
- Generazione mock mediterranea senza allergie: sette richieste pranzo ricevono
  gli obiettivi della rotazione, il piano usa almeno quattro famiglie, non ha
  duplicati semantici consecutivi e usa 14 chiamate, sotto il cap 28.
- Generazione mock del Piano B mediterraneo: sette obiettivi ruotati e nessuna
  seconda istruzione tematica che imponga una famiglia in conflitto.

## Verifica eseguita

```text
npm run typecheck
npm run test:ai
git diff --check
```

Risultato: tutte le suite completate senza fallimenti. La suite AI include
vincoli/allergeni, audit allergeni, budget modello, varietà generale,
varietà lactose, richiesta HTTP e generazione mock. Non sono stati modificati
allergeni, normalizzazione, validazione di sicurezza, UI, database, quote,
route applicative, `MAX_MEAL_PLAN_MODEL_CALLS = 28` o
`MAX_LOCAL_VARIETY_REPAIRS = 3`.