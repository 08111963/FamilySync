---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Una settimana non va generata in un'unica risposta AI enorme: deve restare divisa per tipo di pasto e le richieste devono partire in parallelo. Ogni ricetta mantiene da 3 a 6 passaggi chiari e utilizzabili. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** nella pratica una risposta seriale con 21 ricette è più lenta dell'attesa massima di tre risposte piccole parallele; comprimere ogni ricetta in micro-frammenti rende anche l'anteprima inutilizzabile.

**How to apply:** applicare gli stessi tre flussi paralleli anche al piano standard e a quello con vincoli; proteggere completezza settimanale, varietà, ingredienti e istruzioni leggibili per ogni pasto. Una risposta incompleta viene rifiutata senza progressi parziali.