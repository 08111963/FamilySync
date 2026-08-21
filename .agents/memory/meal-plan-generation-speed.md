---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Una settimana non va generata in un'unica risposta AI enorme né in blocchi settimanali da sette ricette dettagliate. Va divisa in richieste giornaliere piccole: la colazione resta separata da pranzo/cena quando serve una lista di ingredienti sicuri distinta. Ogni ricetta mantiene da 3 a 6 passaggi chiari e utilizzabili. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** il provider può produrre JSON formalmente valido ma troncare un blocco da sette ricette, lasciando un piano incompleto. Richieste giornaliere con una o due ricette eliminano quella compressione senza ridurre il dettaglio utile.

**How to apply:** eseguire in parallelo le richieste giornaliere sia per il piano standard sia per quello con vincoli; proteggere completezza settimanale, varietà, ingredienti e istruzioni leggibili per ogni pasto. Una risposta incompleta viene rigenerata una sola volta e non produce progressi parziali.