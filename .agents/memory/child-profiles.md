---
name: Profili bambino gestiti (senza account)
description: familyMembers.userId è nullable — membri "profilo bambino" senza account/email gestiti dai genitori.
---

`family_members.user_id` è NULLABLE (migrazione 0022): userId NULL = "profilo bambino" gestito dai genitori (nessun login, nessuna email). Il nome visualizzato è `family_members.name` (solo per profili senza account); per membri con account resta `users.name`.

**Regole:**
- Creazione: POST /api/families/:id/child-profiles, solo admin/adult, ruolo sempre `child`, conta nel limite Free (check atomico in transazione).
- Gestione: admin modifica/elimina chiunque; adult modifica/elimina SOLO profili con userId NULL; il campo `name` è modificabile solo per profili senza account.
- GET family detail usa LEFT JOIN su users ed espone `isManagedProfile: true` e `userId: null`.
- Ogni codice che mappa member→userId per push/email/blocchi/chat DEVE saltare userId NULL (guardie già in chores/calendar/push/event-reminders). INNER JOIN su users esclude i profili gestiti automaticamente — spesso è il comportamento giusto (niente notifiche), ma attenzione ai conteggi.
- Privacy: mai raccogliere dati di contatto del minore; cancellazione solo da parte dei genitori.

Test: `server/__tests__/child-profiles.test.ts`.

**Promozione a account vero:** family_invites.member_id (nullable, FK ON DELETE CASCADE) marca gli inviti di "promozione": all'accettazione (sia nuovo utente sia join da loggato) si fa UPDATE del familyMembers esistente (set userId, WHERE userId IS NULL) invece di INSERT — punti/storico preservati, ruolo invariato. Il controllo limite membri Free va SALTATO per questi inviti (il membro conta già). 0 righe aggiornate = profilo eliminato/già collegato → rollback (PROFILE_GONE). Prima di testare la promozione, verificare che le migrazioni recenti (colonne/tabelle coinvolte) siano applicate al DB in uso.
