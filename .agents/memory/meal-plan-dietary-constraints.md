---
name: Vincoli alimentari piani pasti
description: Regole di sicurezza per dieta, allergie e note sanitarie nella generazione e modifica dei piani pasti.
---

Dieta e allergie compilate sono vincoli obbligatori, non suggerimenti. Un risultato non verificabile o incompatibile non deve essere mostrato né salvato; la stessa regola vale per aggiunte, modifiche e ricette collegate successive.

**Why:** affidarsi soltanto al prompt permette al modello di ignorare il vincolo e proporre alimenti pericolosi. Inoltre, rimuovere silenziosamente le allergie quando manca il consenso crea un falso senso di sicurezza.

**How to apply:** rilevare e richiedere il consenso salute prima di qualsiasi invio all'AI; estrarre solo note sanitarie interpretabili in modo deterministico e rifiutare quelle ambigue; validare l'output completo prima dello streaming e applicare lo stesso controllo a ogni percorso di persistenza. I prompt devono sostituire, non solo contraddire, qualunque esempio o tema incompatibile con un vincolo noto. Per allergie esplicite, non affidarsi al solo prompt o a retry lunghi: vincolare lo schema di risposta agli ingredienti già compatibili e rendere titolo, descrizione e passaggi dagli stessi ingredienti validati. Generare una richiesta settimanale per ciascun tipo di pasto attivo, in parallelo, perché gruppi più grandi possono troncare il risultato; ogni richiesta deve essere completa. Applicare la lista e la validazione semantica da colazione anche senza allergie, per non accettare pasti da pranzo/cena al mattino. Durante l'attesa si possono inviare soltanto stati fissi del server, mai contenuti del piano non validati.

Le sentinelle periodiche sui vincoli alimentari devono usare soltanto casi sintetici supportati e lo stesso validatore del percorso utente. Telemetria e alert devono contenere esclusivamente esito, numero di tentativi e codici di violazione, con un budget rigido di chiamate e senza diagnostica interna del generatore.

**Why:** contenuti di pasti e preferenze non servono a rilevare una regressione e aumentano inutilmente il rischio privacy; errori temporanei del provider o un singolo tentativo poi corretto non sono regressioni confermate e non devono creare falsi allarmi o consumi ripetuti.

**How to apply:** rendere il controllo esplicitamente opt-in, usare un claim durevole per limitare la frequenza tra istanze, non rilasciare il budget dopo errori, e notificare solo quando tutti i tentativi fissi violano lo stesso allergene sentinella.
