---
name: Promemoria eventi calendario
description: Email+push server-side per eventi di oggi/domani, dedup event_reminder_log
---

**Fasce orarie (ago 2026):** i promemoria (eventi E bollette) partono solo in fasce italiane — "oggi" 7-21, "domani" 17-21 — perché il primo tick dopo mezzanotte inviava push alle 00:50 che nessuno vedeva; `runOnce(hourOverride?)` per i test. Il dedup claim avviene solo dentro processKind, quindi i tick fuori fascia non bruciano il promemoria.

Scheduler orario (Europe/Rome) in server/lib che replica lo schema dei promemoria bollette: kinds `event_today`/`event_tomorrow`, claim atomico su `event_reminder_log` UNIQUE(event_id,kind), claim rilasciato se NESSUNA email parte.

**Why:** dedup sicuro anche con più istanze; meglio una push duplicata che un promemoria perso.

**Durabilità autoscale:** entrambi gli scheduler (bollette+eventi) passano da `startDurableScheduler` (server/lib/scheduled-jobs.ts): last-run persistito in `scheduled_job_runs` con claim atomico (finestra 50 min, poll orario, catch-up al boot); il claim del job viene rilasciato se il run lancia. Il dedup per-elemento resta la garanzia anti-doppioni. Migrazione `0020_scheduled_job_runs.sql` da portare in prod.

**How to apply:** destinatari = membri famiglia con email verificata, ESCLUSI gli utenti in blocco reciproco con `createdBy` dell'evento (getBlockRelatedUserIds), sia per email che per push (excludeUserIds). Migrazione `0019_event_reminder_log.sql` da portare in prod. L'email "nuovo evento creato" NON è implementata (opzionale, da confermare col proprietario).
