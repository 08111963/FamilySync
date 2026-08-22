---
name: Velocità generazione piani pasti
description: Compromesso tra latenza del piano standard e dettaglio della ricetta visibile all'utente.
---

Una settimana va generata in un'unica risposta AI strutturata, con un blueprint locale che pianifica varietà e vincoli prima della chiamata. Ogni ricetta mantiene da 3 a 6 passaggi chiari e utilizzabili. I percorsi con vincoli sanitari mantengono una validazione fail-closed.

**Why:** il requisito di prodotto privilegia la coerenza dell'intera settimana e il costo prevedibile. Un singolo JSON full-week evita menu composti da richieste indipendenti; il limite di token, lo schema con conteggio esatto e la validazione locale impediscono di consegnare output troncati o incompleti.

**How to apply:** eseguire una sola richiesta full-week sia per il piano standard sia per quello con vincoli; proteggere completezza, varietà, ingredienti e istruzioni leggibili per ogni pasto. In caso di difetto deterministico, passare il JSON precedente e una correzione mirata a un solo repair full-week, mai a sostituzioni per singolo pasto. Anche JSON non parsabile o top-level senza array `items` è un difetto dell'output: classificarlo come repair prima di qualunque mappatura degli errori provider. La varietà va ottenuta con temi giornalieri concreti e validata dopo la sicurezza; i difetti advisory non devono generare falsi retry. I vincoli sanitari non sono una preferenza per prodotti integrali: se non richiesti esplicitamente, vanno vietati nel prompt e l'output che li contiene va rifiutato. Le colazioni e le cene necessitano di una rotazione giornaliera concreta. Nello schema AI i campi obbligatori di titolo, descrizione, ingredienti e passaggi devono anche avere lunghezza minima. Il budget condiviso resta 28 come difesa in profondità: contare ogni chiamata prima del provider e non superare una chiamata iniziale più un repair.

**Vincolo di costo:** il tetto di 28 chiamate è anche un limite economico hard: non aumentarlo e non introdurre retry/riparazioni aggiuntive senza una decisione esplicita, perché le chiamate passano dall'integrazione AI gestita da Replit e consumano i crediti del progetto.

**Why:** una chiamata fallita o di riparazione può comunque essere fatturata dal provider; la prevedibilità del consumo è parte del requisito del Piano Pasti, non solo un'ottimizzazione tecnica.

**How to apply:** preferire validazione fail-closed, messaggi chiari e consegna senza rigenerazione quando il limite è raggiunto; ogni futura modifica al budget deve essere valutata come modifica di costo e approvata esplicitamente.