---
name: Qualità Piano Pasti Mediterraneo
description: Quote e varietà mediterranee sono osservabili; la sicurezza e gli ingredienti concreti restano obbligatori.
---

Le quote qualitative del solo profilo Mediterranea (pasta, pesce, carne rossa o bianca, uova, legumi e varietà) sono telemetria editoriale e non devono bloccare la consegna né avviare un repair. Gli ingredienti devono comunque restare concreti: placeholder come “verdure miste” e “cereali misti” sono rifiutati dal validatore dei vincoli.

**Why:** una settimana completa, sicura e ben formata può discostarsi da quote nutrizionali editoriali; respingerla dopo due chiamate produce un errore inutile per l’utente e spreca il solo repair disponibile.

**How to apply:** calcolare e registrare le quote ai tre profili mediterranei prima della consegna e dopo eventuali trasformazioni locali, ma non lanciare eccezioni o rigenerazioni per esse. Restano fail-closed il profilo scelto, allergie/intolleranze, ingredienti concreti, completezza del JSON e i vincoli alimentari espliciti.