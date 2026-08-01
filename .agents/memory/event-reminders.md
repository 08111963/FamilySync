---
name: Promemoria eventi calendario
description: Email+push server-side per eventi di oggi/domani, dedup event_reminder_log
---

Scheduler orario (Europe/Rome) in server/lib che replica lo schema dei promemoria bollette: kinds `event_today`/`event_tomorrow`, claim atomico su `event_reminder_log` UNIQUE(event_id,kind), claim rilasciato se NESSUNA email parte.

**Why:** dedup sicuro anche con più istanze; meglio una push duplicata che un promemoria perso.

**How to apply:** destinatari = membri famiglia con email verificata, ESCLUSI gli utenti in blocco reciproco con `createdBy` dell'evento (getBlockRelatedUserIds), sia per email che per push (excludeUserIds). Migrazione `0019_event_reminder_log.sql` da portare in prod. L'email "nuovo evento creato" NON è implementata (opzionale, da confermare col proprietario).
