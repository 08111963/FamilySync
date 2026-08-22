---
name: Vincoli dopo le correzioni del Piano Pasti
description: Regola per mantenere i requisiti nutrizionali obbligatori attraverso le trasformazioni post-generazione.
---

Ogni correzione locale applicata dopo la validazione iniziale del Piano Pasti deve preservare i vincoli nutrizionali obbligatori; se non può farlo, si conserva il pasto sicuro originale. L’output finale va sempre verificato nuovamente prima di inviarlo al client.

**Why:** una sostituzione di varietà può cambiare proprio l’unico pasto che soddisfa un requisito settimanale, rendendo non conforme un piano che era stato validato all’inizio.

**How to apply:** per ogni nuova riparazione, ordinamento o trasformazione successiva alla convalida, rendere espliciti i requisiti da preservare e aggiungere una verifica difensiva sull’elenco finale, senza introdurre chiamate AI extra.