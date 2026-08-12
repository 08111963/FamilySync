---
name: Client crash alert persistente
description: Alert email sui CLIENT_CRASH — stato su DB, cooldown via claim atomico
---

Contatori/cooldown che devono sopravvivere a riavvii e più istanze vanno su DB, con claim atomico riusando il pattern `scheduled_job_runs` (claim = diritto di agire una sola volta; release SOLO se l'azione fallisce del tutto).

**Why:** su autoscale lo stato in-memory si azzera/frammenta tra istanze: soglie che non scattano oppure email doppie.

Nuove tabelle che condizionano feature best-effort (persistenza fail-open) vanno garantite anche con un ensure idempotente all'avvio (pattern ensure-pantry-schema: to_regclass + advisory lock): il DB prod è separato e la sola migrazione in migrations/ non basta finché non arriva un Publish.

**How to apply:** endpoint pubblici restano fail-open (errori solo loggati, risposta sempre di successo) ma la risposta va emessa DOPO l'attesa della persistenza, mai fire-and-forget, altrimenti un riavvio subito dopo la risposta perde il dato. Sanificare i contenuti PRIMA dell'insert: mai token/segreti su DB.
