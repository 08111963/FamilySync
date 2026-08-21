---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Una settimana non va generata in un'unica risposta AI enorme né in blocchi settimanali da sette ricette dettagliate. Va divisa in richieste giornaliere piccole: la colazione resta separata da pranzo/cena quando serve una lista di ingredienti sicuri distinta. Ogni ricetta mantiene da 3 a 6 passaggi chiari e utilizzabili. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** il provider può produrre JSON formalmente valido ma troncare un blocco da sette ricette, lasciando un piano incompleto. Richieste giornaliere con una o due ricette eliminano quella compressione senza ridurre il dettaglio utile.

**How to apply:** eseguire in parallelo le richieste giornaliere sia per il piano standard sia per quello con vincoli; proteggere completezza settimanale, varietà, ingredienti e istruzioni leggibili per ogni pasto. La varietà va ottenuta con temi giornalieri concreti e validata solo sui titoli normalizzati identici: il confronto semantico di parole condivise (es. “yogurt” o “frutta”) genera falsi positivi e può bloccare un piano valido. I vincoli sanitari non sono una preferenza per prodotti integrali: se non richiesti esplicitamente, vanno vietati nel prompt e l'output che li contiene va rigenerato. Le colazioni e le cene necessitano di una rotazione giornaliera concreta, non di istruzioni generiche compatibili. Nello schema AI i campi obbligatori di titolo, descrizione, ingredienti e passaggi devono anche avere lunghezza minima: `required` da solo ammette stringhe vuote e può produrre 21 pasti formalmente presenti ma inutilizzabili. Il budget condiviso è 28: riservare ogni chiamata prima del provider e verificare prima di ogni settimana completa che il residuo la possa terminare. Formato e vincoli/allergeni hanno una seconda settimana completa obbligatoria e fail-closed; la varietà parte solo dopo un piano sicuro, con al massimo tre repair locali. Non rigenerare mai una settimana intera per soli doppioni: un piano sicuro ma monotono viene consegnato con advisory. Nessun tentativo intermedio produce progressi parziali.

**Vincolo di costo:** il tetto di 28 chiamate è anche un limite economico hard: non aumentarlo e non introdurre retry/riparazioni aggiuntive senza una decisione esplicita, perché le chiamate passano dall'integrazione AI gestita da Replit e consumano i crediti del progetto.

**Why:** una chiamata fallita o di riparazione può comunque essere fatturata dal provider; la prevedibilità del consumo è parte del requisito del Piano Pasti, non solo un'ottimizzazione tecnica.

**How to apply:** preferire validazione fail-closed, messaggi chiari e consegna senza rigenerazione quando il limite è raggiunto; ogni futura modifica al budget deve essere valutata come modifica di costo e approvata esplicitamente.