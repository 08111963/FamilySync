---
name: Vincoli alimentari piani pasti
description: Regole di sicurezza per dieta, allergie e note sanitarie nella generazione e modifica dei piani pasti.
---

Dieta e allergie compilate sono vincoli obbligatori, non suggerimenti. Un risultato non verificabile o incompatibile non deve essere mostrato né salvato; la stessa regola vale per aggiunte, modifiche e ricette collegate successive.

**Why:** affidarsi soltanto al prompt permette al modello di ignorare il vincolo e proporre alimenti pericolosi. Inoltre, rimuovere silenziosamente le allergie quando manca il consenso crea un falso senso di sicurezza.

**How to apply:** rilevare e richiedere il consenso salute prima di qualsiasi invio all'AI; estrarre solo note sanitarie interpretabili in modo deterministico e rifiutare quelle ambigue; validare l'output completo prima dello streaming e applicare lo stesso controllo a ogni percorso di persistenza.