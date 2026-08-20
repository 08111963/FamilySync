---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Il percorso rapido può ridurre il dettaglio della risposta, ma deve mantenere un dettaglio della ricetta utilizzabile per ogni pasto. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** eliminare le richieste separate riduce l'attesa percepita, ma omettere del tutto le istruzioni rende l'anteprima del piano inutilizzabile perché non può più mostrare il dettaglio della ricetta.

**How to apply:** quando si riduce il dettaglio del percorso standard, proteggere completezza settimanale, varietà, ingredienti e istruzioni minime visualizzabili. Non applicare questa semplificazione a dieta, allergie o dati salute; una risposta incompleta viene rifiutata senza progressi parziali.