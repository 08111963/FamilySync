---
name: Modulo feedback tester
description: Modulo interno "Dacci il tuo parere" (bug/suggerimenti/stelle) e pannello owner
---

- Feedback tester in-app: invio per ogni utente verificato; consultazione SOLO owner (APP_OWNER_EMAILS, email riletta dal DB) — volutamente NON dietro il flag ENABLE_TEST_ANALYTICS, resta attivo per tutta la fase test.
- **Why:** il pannello analytics è spegnibile col flag, il feedback deve continuare a raccogliere anche se l'analytics viene disattivata.
- Pattern voce menu riservata: endpoint `/access` che risponde 200 solo all'owner; il client mostra la card solo se la query ha successo (retry: false).
- Anti-spam: max 5 invii per utente su finestra mobile 24h (messaggio d'errore deve dire "nelle ultime 24 ore", non "oggi").
- Ogni nuova tabella va anche in `migrations/` (000N_*.sql) oltre a db:push, altrimenti la prod che si affida alle migrazioni fallisce a runtime.
