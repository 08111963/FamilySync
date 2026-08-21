---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Una settimana non va generata in un'unica risposta AI enorme né in blocchi settimanali da sette ricette dettagliate. Va divisa in richieste giornaliere piccole: la colazione resta separata da pranzo/cena quando serve una lista di ingredienti sicuri distinta. Ogni ricetta mantiene da 3 a 6 passaggi chiari e utilizzabili. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** il provider può produrre JSON formalmente valido ma troncare un blocco da sette ricette, lasciando un piano incompleto. Richieste giornaliere con una o due ricette eliminano quella compressione senza ridurre il dettaglio utile.

**How to apply:** eseguire in parallelo le richieste giornaliere sia per il piano standard sia per quello con vincoli; proteggere completezza settimanale, varietà, ingredienti e istruzioni leggibili per ogni pasto. La varietà va verificata sul server confrontando i titoli semanticamente simili per tipo di pasto e giorno; i contorni condivisi da soli non rendono due ricette duplicate. Nello schema AI i campi obbligatori di titolo, descrizione, ingredienti e passaggi devono anche avere lunghezza minima: `required` da solo ammette stringhe vuote e può produrre 21 pasti formalmente presenti ma inutilizzabili. Una risposta incompleta o monotona viene rigenerata una sola volta e non produce progressi parziali.