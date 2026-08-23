---
name: Qualità Piano Pasti Mediterraneo
description: Regole dure per evitare settimane mediterranee sbilanciate o con ingredienti generici.
---

Le quote qualitative del profilo Mediterranea devono essere verificate server-side in modalità fail-closed. Pasta, pesce, carne rossa, carne bianca, uova e legumi contano solo quando il nome concreto è dichiarato tra gli ingredienti; titoli, descrizioni e passaggi possono corroborare la varietà, ma non soddisfare da soli una quota. I placeholder come “verdure miste” e “cereali misti” non sono ingredienti concreti.

**Why:** un modello può citare un alimento nel testo senza averlo realmente usato, oppure produrre settimane formalmente sicure ma poco mediterranee. Le quote servono a proteggere la qualità consegnata senza affidarsi soltanto al prompt.

**How to apply:** applicare il controllo ai tre profili mediterranei sia prima della consegna sia dopo eventuali trasformazioni locali; usare il percorso di un solo repair globale già esistente e mantenere la compatibilità con i profili senza glutine e senza lattosio.