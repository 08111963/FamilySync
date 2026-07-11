---
name: Promemoria bollette+eventi via push server
description: Scheduler server unico che invia promemoria bollette ed eventi via Expo push a tutti i membri; regole anti-doppione e retry.
---

# Promemoria bollette + eventi via push dal server

- Scheduler UNICO (tick 60s, avviato in server/index.ts) per bollette ed eventi; ogni dominio ha la propria tabella log e il proprio modulo di calcolo, stesso pattern.
- Bollette: calcola i promemoria dovuti con la STESSA semantica del client (offset per piano a 08:00, personalizzati a ora esatta) ma in fuso `PUSH_TZ` (default Europe/Rome) perché il server gira in UTC — conversione two-pass con Intl.
- Eventi: con orario ⇒ avviso 30 min prima; senza orario/all-day ⇒ 08:00 del giorno; orario malformato trattato come senza orario (validare 0-23/0-59, il rollover di Date.UTC inganna); ricorrenze ignorate (non usate dalla UI eventi); query ristretta a ieri..domani (confronto lessicografico su varchar "AAAA-MM-GG").
- **Anti-doppione**: claim atomico `INSERT ... ON CONFLICT DO NOTHING` su tabella log con chiave unica (billId, reminderKey); reminderKey include la dueDate per gli offset (cambio scadenza ⇒ re-invio legittimo).
- **Affidabilità**: `sendPushToUser` restituisce esito strutturato ({ok, delivered, tokens}); se NESSUN membro ha ricevuto e c'è stato un errore di invio, il claim viene cancellato ⇒ retry al tick successivo entro la finestra di recupero (30 min). Se almeno uno ha ricevuto, il claim resta (no doppioni).
- **Client anti-doppia notifica**: useBillLocalNotifications salta e CANCELLA le notifiche locali bollette quando in AsyncStorage c'è il token push (solo build di produzione; in Expo Go il token non viene mai registrato ⇒ restano le locali).
- **Vincolo infra**: il deployment è autoscale ⇒ il setInterval NON gira quando l'istanza dorme. Per push affidabili agli orari previsti serve Reserved VM (o scheduler esterno). L'utente va avvisato a ogni discussione su affidabilità push.
- **Why**: le notifiche locali arrivano solo sul dispositivo che ha aperto l'app di recente; gli altri membri della famiglia le riceverebbero solo riaprendo l'app.
- **How to apply**: qualunque nuovo promemoria "a orario" lato server deve riusare lo stesso pattern claim→send→unclaim-se-fallito e la conversione tz two-pass; non fidarsi dell'orario locale del server.
