# Ottimizzazione latenza Piano Pasti

## Baseline osservata

Il 22 agosto 2026 due richieste reali di generazione con vincoli si sono
concluse con timeout dopo circa 121 secondi. Il timeout del provider veniva
ritentato automaticamente dal client SDK: un singolo timeout di circa 60
secondi diventava quindi un'attesa percepita doppia, senza un piano
consegnabile.

## Interventi

- Il contratto resta una chiamata full-week, ma richiede ricette compatte:
  descrizione breve e tre passaggi concreti per ciascuno dei 21 pasti.
- Il limite di completamento passa da 7.000 a 4.800 token, con margine per
  ingredienti e tutti i profili dieta chiusi.
- La chiamata Piano Pasti disabilita il retry automatico del trasporto
  (`maxRetries: 0`): un timeout non genera una seconda chiamata fisica né
  altri 60 secondi di attesa.
- Lo stream invia subito lo stato iniziale e un aggiornamento ogni otto
  secondi; continua a inviare pasti soltanto dopo la validazione completa.

## Misurazione dopo il rilascio

Il log `AI_MEAL_PLAN_LATENCY` mantiene fino a 20 campioni per `standard` e
`constrained`, senza dati familiari o contenuto generato. Per il percorso
normale registra p50/p95 di:

- durata totale;
- preparazione locale;
- provider;
- parsing;
- validazione;
- dimensione della risposta.

I tentativi di repair hanno una serie distinta con p50/p95 della durata
totale e di ciascuna fase, così non alterano i percentili del primo tentativo.

La verifica quantitativa va fatta sui primi campioni ottenuti dopo il prossimo
rilascio: questo lavoro non include un deploy e quindi non dichiara
artificiosamente una nuova latenza reale di produzione.

## Garanzie mantenute

- una sola chiamata full-week nel percorso normale;
- al massimo un repair globale;
- validazione fail-closed, blueprint e tutti i profili dieta invariati;
- correlazione `requestId` e `dietProfile` invariata;
- nessun pasto parziale o non validato nello stream.