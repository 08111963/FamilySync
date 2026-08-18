---
name: Accesso dispositivo bambino (codice PIN)
description: Convenzioni per l'accesso bambino senza email — shadow user, email sintetica, revoca, aree vietate server-side.
---

Un profilo bambino gestito (senza account) può entrare dal proprio dispositivo con un codice generato dal genitore, senza email/password.

**Decisione: approccio shadow-user.** L'attivazione del codice crea un vero utente (`isChildAccount=true`, email sintetica sul dominio riservato `child.familysync.invalid`, nessuna password) e collega il membro. Così JWT, push (mapping member→userId non più NULL) e gli endpoint esistenti funzionano invariati.

**Why:** una sessione/ruolo ad hoc avrebbe richiesto di duplicare auth e push per un tipo di sessione speciale; lo shadow user riusa tutto ed è revocabile in modo pulito.

**Regole durature:**
- Del codice esiste SOLO l'hash nel DB, monouso in transazione, TTL breve, errore generico anti-enumeration, rate limiter pubblico dedicato (stesso pattern degli inviti sicuri).
- Nessun flusso deve mai inviare email a un account bambino: la guardia centrale nell'invio email scarta il dominio sintetico. Non aggiungere eccezioni.
- Le aree "da adulti" (bollette, budget, AI, pagamenti, ricette, meal-plans, support, feedback, gestione famiglia, self-service account/profilo) sono vietate SERVER-SIDE fail-closed con middleware dedicato; il client le nasconde soltanto. Ogni nuovo modulo da adulti deve montare la stessa guardia.
- Revoca = solo il genitore (il bambino non può auto-eliminarsi): unlink del membro + soft-delete dello shadow user + bump tokenVersion → 401 immediato; punti/storico intatti, profilo di nuovo promuovibile (la promozione richiede prima la revoca).
- Rigenerare un codice per un membro già collegato è consentito (cambio dispositivo) e invalida i token precedenti.
- Dati condivisi in sola lettura per il bambino: calendar/shopping/rewards montati con blockChildWrites; chores usa blockChildAccount per-rotta su POST/PUT/DELETE. UNICA scrittura consentita: completare la faccenda assegnata al PROPRIO membro (punti decisi dal genitore). GET feed-url ICS è vietata al bambino (GET che rigenera/espone il token: blockChildWrites non basta sulle GET).
