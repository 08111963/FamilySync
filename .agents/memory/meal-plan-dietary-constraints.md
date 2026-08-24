---
name: Vincoli alimentari piani pasti
description: Regole di sicurezza per dieta, allergie e note sanitarie nella generazione e modifica dei piani pasti.
---

Dieta e allergie compilate sono vincoli obbligatori, non suggerimenti. Un risultato non verificabile o incompatibile non deve essere mostrato né salvato; la stessa regola vale per aggiunte, modifiche e ricette collegate successive.

**Why:** affidarsi soltanto al prompt permette al modello di ignorare il vincolo e proporre alimenti pericolosi. Inoltre, rimuovere silenziosamente le allergie quando manca il consenso crea un falso senso di sicurezza.

**How to apply:** rilevare e richiedere il consenso salute prima di qualsiasi invio all'AI; estrarre solo note sanitarie interpretabili in modo deterministico e rifiutare quelle ambigue; il riconoscimento deve coprire le normali varianti linguistiche di condizioni comuni (ad esempio celiaco, celiaca e celiachia) prima di scegliere il percorso standard. Una condizione medica non traducibile in una regola deve restare bloccante anche se la medesima nota include un'allergia estraibile. Validare l'output completo prima dello streaming e applicare lo stesso controllo a ogni percorso di persistenza. I prompt devono sostituire, non solo contraddire, qualunque esempio o tema incompatibile con un vincolo noto. Per allergie esplicite, non affidarsi al solo prompt o a retry lunghi: vincolare lo schema di risposta agli ingredienti già compatibili e rendere titolo, descrizione e passaggi dagli stessi ingredienti validati. Per il lattosio, privilegiare ricette naturalmente prive di latticini invece di dipendere da sostituti nominati in testo libero; un riferimento generico a latte o formaggio deve rimanere bloccante. Le colazioni settimanali per il solo lattosio devono essere costruite da ricette server-side già verificate, non generate nel testo libero del modello: evita sia falsi ingredienti sia risposte parziali. Una frase fissa che descrive soltanto l'intolleranza può essere ammessa se non è un ingrediente, ma non trasformare questa eccezione in una whitelist generica. Generare una richiesta settimanale per ciascun tipo di pasto attivo, in parallelo, perché gruppi più grandi possono troncare il risultato; ogni richiesta deve essere completa. Se il provider restituisce un formato incompleto, consentire un solo recupero interno completo, senza mostrare progressi parziali o cicli di tentativi. Applicare la lista e la validazione semantica da colazione anche senza allergie, per non accettare pasti da pranzo/cena al mattino. Durante l'attesa si possono inviare soltanto stati fissi del server, mai contenuti del piano non validati.

Le sentinelle periodiche sui vincoli alimentari devono usare soltanto casi sintetici supportati e lo stesso validatore del percorso utente. Telemetria e alert devono contenere esclusivamente esito, numero di tentativi e codici di violazione, con un budget rigido di chiamate e senza diagnostica interna del generatore.

**Why:** contenuti di pasti e preferenze non servono a rilevare una regressione e aumentano inutilmente il rischio privacy; errori temporanei del provider o un singolo tentativo poi corretto non sono regressioni confermate e non devono creare falsi allarmi o consumi ripetuti.

**How to apply:** rendere il controllo esplicitamente opt-in, usare un claim durevole per limitare la frequenza tra istanze, non rilasciare il budget dopo errori, e notificare solo quando tutti i tentativi fissi violano lo stesso allergene sentinella. I log di richiesta possono includere esclusivamente i termini da un elenco chiuso di allergeni che hanno causato il rifiuto, mai titoli, ricette o preferenze.

La dieta, le allergie e le note devono attraversare una sola normalizzazione canonica che separa pattern alimentari da esclusioni. `gluten` e `lactose` devono avere lo stesso significato indipendentemente dal campo di origine; `milk` resta un'esclusione distinta.

**Why:** inferire regole diverse da ciascun campo, oppure trasformare ogni token libero in blacklist, fa divergere prompt, allowlist e validatore e può rifiutare alimenti dichiarati compatibili.

**How to apply:** usa le esclusioni canoniche per consenso, prompt, schema, allowlist e validazione. I prodotti trasformati a rischio glutine sono ammessi soltanto con dicitura esplicita “senza glutine”; una scelta personale “senza glutine” non è di per sé dato sanitario, mentre celiachia e allergie dichiarate richiedono il consenso salute.

Il menu del Piano Pasti resta chiuso ai sette profili definiti dal prodotto. Glutine e lattosio sono vincoli indipendenti: il solo senza glutine richiede sostituti espliciti, mentre il solo senza lattosio mantiene pasta, pane e fette biscottate normali e non deve introdurre diciture senza glutine.

**Why:** combinare o far ereditare implicitamente le due esclusioni restringe inutilmente il menu e può fare passare prodotti con glutine nel profilo sbagliato.

**How to apply:** converti un identificatore storico soltanto quando conserva integralmente i suoi vincoli; un profilo storico non rappresentabile deve richiedere una nuova scelta esplicita, mai ricadere su un profilo più permissivo. Applica la regola anche agli ingressi client come la dettatura: una frase bloccata non deve né avviare lo stream né restare nelle note della scelta manuale successiva.

La varietà culinaria è una preferenza best-effort separata dalla sicurezza: i blocchi giornalieri possono ricevere solo categorie aggregate già usate per ridurre le ripetizioni, ma non devono allentare la closed allowlist né trasformare monotonia in una violazione alimentare.

**Why:** un prompt sicuro ma troppo ristretto tende a ripetere riso e una singola proteina; rigenerare con ulteriori chiamate costa quota e non dà garanzie migliori.

**How to apply:** mantenere invariato il budget di chiamate e passare ai blocchi successivi solo un contesto compatto di carboidrati/proteine già usati. Un controllo deterministico può segnalare fonti dominanti e varietà bassa, ma la validazione dei vincoli alimentari prevale sempre.
