// FONTE UNICA della Privacy Policy di FamilySync.
// Questo file è l'unico posto in cui vive il testo della policy:
// - la pagina web /legal/privacy (server/routes/legal.ts) lo rende in HTML;
// - la schermata mobile (app/legal/privacy.tsx) lo rende in React Native;
// - il DOCX di consegna (scripts/generate-privacy-docx.mjs) lo rende in Word.
// Non copiare o duplicare questi testi altrove: modificare SOLO qui.
// Il grassetto è indicato con **doppi asterischi**; email e URL sono testo
// semplice che i renderer possono trasformare in link.

import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from "./policy-version";

export const POLICY_APP_NAME = "FamilySync";
export const POLICY_OWNER = "FamilySync";
export const POLICY_CONTACT_EMAIL = "assistenza@familysync.it";
export const POLICY_SITE_URL = "https://familysync.eu";

export type PolicyBlock = { type: "p" | "li"; text: string };

export interface PolicySection {
  title: string;
  blocks: PolicyBlock[];
}

const p = (text: string): PolicyBlock => ({ type: "p", text });
const li = (text: string): PolicyBlock => ({ type: "li", text });

export const PRIVACY_POLICY_INTRO = `**Versione ${PRIVACY_POLICY_VERSION} — ${PRIVACY_POLICY_DATE}**`;

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    title: "1. Titolare del Trattamento",
    blocks: [
      p("Il titolare del trattamento dei dati personali è **FamilySync**."),
      p("Per qualsiasi domanda o richiesta relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: assistenza@familysync.it"),
      p("Sito di riferimento: https://familysync.eu"),
    ],
  },
  {
    title: "2. Dati Raccolti",
    blocks: [
      p("FamilySync raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:"),
      li("**Dati di account:** nome, indirizzo email e password. La password non viene mai conservata in chiaro: viene salvata solo una sua rappresentazione irreversibile ottenuta con un algoritmo di hashing robusto, secondo le buone pratiche di settore"),
      li("**Fascia di età (obbligatoria):** in fase di registrazione ti chiediamo di indicare una fascia di età (14-17 anni oppure 18 anni o più). Non raccogliamo la data di nascita. Questa informazione serve solo ad applicare le tutele previste per i minori"),
      li("**Verifica e sicurezza account:** token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica"),
      li("**Registro dei consensi:** data, tipo di consenso (es. Termini, funzioni AI), stato (prestato/revocato) e versione della policy in vigore al momento"),
      li("**Dati familiari:** nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)"),
      li("**Accesso dispositivo bambino (facoltativo):** se un genitore attiva l'accesso con codice per un profilo bambino, conserviamo solo una rappresentazione hashata del codice (mai il codice in chiaro), la sua data di scadenza e un identificativo tecnico interno non recapitabile. Non viene raccolta alcuna email, password o altro dato di contatto del minore (vedi la sezione Minori)"),
      li("**Eventi calendario:** titoli, date, orari, luoghi e descrizioni degli eventi condivisi"),
      li("**Liste della spesa e dispensa:** nomi delle liste, articoli inseriti e relativo storico"),
      li("**Faccende domestiche:** attività assegnate, stato di completamento, punti accumulati"),
      li("**Ricette e piani pasti:** ricette, ingredienti e pianificazioni settimanali"),
      li("**Chat e messaggi:** contenuti dei messaggi scambiati tra i membri della famiglia ed eventuali file/immagini allegati"),
      li("**Allegati caricati dagli utenti:** immagini e documenti caricati nell'app (ad esempio nelle chat o associati alle bollette)"),
      li("**Bollette, scadenze e budget:** titoli, categorie, importi, date di scadenza, fornitori, intestatari, responsabili, note, ricevute, allegati e spese registrate manualmente"),
      li("**Ripartizioni e pagamenti:** suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente"),
      li("**Registrazioni vocali (facoltative):** se usi la dettatura vocale, l'audio viene inviato al fornitore AI (OpenAI) per la sola trascrizione e non viene conservato sui nostri server"),
      li("**Collegamento Google Calendar (facoltativo):** se colleghi il tuo account Google, l'indirizzo email dell'account Google collegato e un token di accesso (refresh token) conservato in forma cifrata, oltre ai riferimenti degli eventi sincronizzati (vedi la sezione dedicata)"),
      li("**Notifiche:** preferenze di notifica e, se attive le notifiche push, il token push del dispositivo"),
      li("**Dati tecnici:** informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione"),
    ],
  },
  {
    title: "3. Dati Inseriti da Altri Membri della Famiglia",
    blocks: [
      p("FamilySync è un'app condivisa: alcune informazioni che ti riguardano possono essere inserite da altri membri della tua famiglia (ad esempio il tuo soprannome, eventi che ti coinvolgono, faccende assegnate a te, ripartizioni di spesa o messaggi che ti citano)."),
      p("Chi inserisce dati relativi ad altre persone è responsabile di farlo in modo corretto e rispettoso. Se ritieni che un dato che ti riguarda sia inesatto o non debba essere presente, puoi modificarlo (dove previsto), chiedere al membro che lo ha inserito di correggerlo, oppure scriverci a assistenza@familysync.it."),
    ],
  },
  {
    title: "4. Finalità e Basi Giuridiche del Trattamento",
    blocks: [
      li("Erogazione del servizio (calendario, liste, faccende, chat, bollette, budget, ricette, sincronizzazione) → esecuzione del contratto (art. 6.1.b GDPR)"),
      li("Comunicazioni di servizio (verifica email, reset password, inviti) → esecuzione del contratto (art. 6.1.b)"),
      li("Funzionalità di intelligenza artificiale → consenso esplicito (art. 6.1.a), revocabile in qualsiasi momento"),
      li("Sincronizzazione facoltativa con Google Calendar → consenso esplicito (art. 6.1.a), prestato collegando il tuo account Google e revocabile in qualsiasi momento scollegandolo"),
      li("Sicurezza, prevenzione abusi, rate limiting, log tecnici → legittimo interesse (art. 6.1.f) alla sicurezza del servizio"),
      li("Analytics interna temporanea di test (eventi tecnici minimi) → legittimo interesse (art. 6.1.f) al miglioramento e alla stabilità del servizio"),
      li("Adempimento di obblighi di legge → obbligo legale (art. 6.1.c)"),
    ],
  },
  {
    title: "5. Bollette e Scadenze",
    blocks: [
      p("FamilySync consente di registrare bollette e scadenze domestiche, inclusi importi, date di scadenza, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri della famiglia e allo storico dei pagamenti."),
      p("**Importante:** l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato \"pagato\" e i relativi importi sono registrazioni inserite manualmente dagli utenti a scopo organizzativo."),
    ],
  },
  {
    title: "6. Email Transazionali",
    blocks: [
      p("FamilySync invia email transazionali tramite il fornitore **Resend** per: verifica dell'account, inviti familiari, reset della password e comunicazioni essenziali relative al servizio."),
      p("Le email **non contengono mai la password** dell'utente. I link di verifica e reset hanno una durata limitata nel tempo (vedi sezione Conservazione dei Dati)."),
    ],
  },
  {
    title: "7. Funzionalità di Intelligenza Artificiale (AI)",
    blocks: [
      p("FamilySync offre funzionalità facoltative basate sull'intelligenza artificiale tramite il fornitore **OpenAI**. Le funzioni AI sono **disattivate finché non le attivi tu**: il consenso non è mai preselezionato, viene richiesto in fase di registrazione oppure può essere prestato in seguito dalle impostazioni, ed è revocabile in qualsiasi momento (Famiglia → Centro Privacy)."),
      p("Le funzioni AI disponibili e i dati inviati al fornitore per ciascuna sono:"),
      li("**Suggerimenti spesa:** numero di membri (senza nomi), articoli recenti delle liste, contenuto della dispensa, titoli degli eventi in programma, stagione corrente"),
      li("**Ottimizzazione faccende:** punti accumulati, titoli e durata stimata delle faccende; i membri vengono indicati con alias temporanei (es. \"Membro 1\") e i soprannomi reali non vengono inviati"),
      li("**Insights familiari e consigli di risparmio:** conteggi aggregati (eventi, faccende, spese per categoria), soprannome del miglior contributore, punti settimanali"),
      li("**Ricette e piani pasti:** preferenze alimentari indicate, eventuali note libere sui pasti, ingredienti disponibili in dispensa, titoli e descrizioni delle ricette. Le **allergie e intolleranze** vengono incluse **solo se hai prestato il consenso specifico e separato** descritto più sotto; senza quel consenso vengono rimosse dai dati inviati e i suggerimenti non ne terranno conto"),
      li("**Compilazione assistita (eventi, faccende, bollette, spese):** il testo libero che detti o scrivi per farti aiutare a compilare i campi (può includere testi relativi a eventi, faccende, bollette e spese, importi e categorie di spesa). Per riconoscere l'assegnatario di un evento o di una faccenda può essere inviato anche il soprannome del membro citato nel testo"),
      li("**Trascrizione vocale:** la registrazione audio della tua voce, inviata al solo scopo di trascriverla in testo; l'audio non viene conservato sui nostri server"),
      li("**Foto ricette AI:** il titolo della ricetta, usato per generare un'immagine illustrativa del piatto"),
      p("**Dati che non inviamo mai per progettazione al fornitore AI:** password, indirizzi email degli account, identificativi interni (ID utente, ID famiglia), dati di pagamento, allegati e ricevute. I contenuti già archiviati nella chat non vengono inviati automaticamente all'AI. Attenzione però: i **campi di testo libero** (testi di eventi, faccende, bollette, spese, note sui pasti, dettatura vocale) vengono inviati così come li scrivi o li detti; se vi inserisci tu stesso/a informazioni come indirizzi, numeri di telefono o dati di terzi, queste verranno trasmesse insieme al resto del testo."),
      p("**Avvertenza:** non inserire nei campi di testo libero dati sanitari non necessari, documenti di identità, credenziali, dati bancari, indirizzi, numeri di telefono o informazioni di terzi non necessarie. Un avviso equivalente è mostrato nell'app vicino alle funzioni AI."),
      p("**Allergie e intolleranze (consenso separato):** le allergie e intolleranze alimentari possono costituire dati relativi alla salute (art. 9 GDPR). Per questo il loro invio alle funzioni AI richiede un **consenso specifico, facoltativo, esplicito e mai preselezionato**, distinto dal consenso AI generale, che puoi prestare e revocare in qualsiasi momento dal Centro Privacy. Il consenso viene registrato con data e versione della policy. Senza questo consenso (o dopo la revoca) le allergie e intolleranze non vengono inviate al fornitore AI e i suggerimenti non ne terranno conto."),
      p("In base ai termini contrattuali del fornitore applicabili all'uso via API, i dati inviati non vengono utilizzati per l'addestramento dei modelli. Il trattamento è regolato anche dalla Privacy Policy di OpenAI (https://openai.com/policies/privacy-policy)."),
      p("I contenuti generati dall'AI sono chiaramente presentati come tali nell'app. Hanno natura indicativa, possono contenere errori e non costituiscono consulenza professionale. FamilySync **non adotta decisioni basate unicamente su trattamenti automatizzati** che producano effetti giuridici o significativi sugli utenti."),
      p("**Base giuridica:** consenso esplicito dell'utente (art. 6.1.a GDPR), revocabile in qualsiasi momento senza pregiudicare la liceità del trattamento precedente."),
    ],
  },
  {
    title: "8. Minori",
    blocks: [
      p("FamilySync è un'app per il coordinamento familiare, pensata per essere usata dalla famiglia insieme."),
      li("Per creare un account in autonomia occorre avere **almeno 14 anni** (età del consenso digitale in Italia, art. 2-quinquies D.Lgs. 196/2003). La registrazione autonoma di minori di 14 anni non è consentita e viene bloccata"),
      li("I minori di 14 anni possono usare l'app solo tramite profili creati e supervisionati da un genitore o tutore che è membro della famiglia"),
      li("**Accesso con codice (facoltativo):** il genitore o tutore può permettere al bambino di usare l'app dal suo dispositivo generando un **codice di accesso** dalla scheda Famiglia. Il codice viene mostrato una sola volta al genitore, funziona **una sola volta**, scade dopo **48 ore** e nel nostro database è conservato solo in forma hashata. Al minore non viene richiesta né email né password: l'accesso è collegato a un identificativo tecnico interno non recapitabile e non raccogliamo alcun dato di contatto del bambino"),
      li("Gli accessi bambino hanno **permessi ridotti applicati dai nostri server** (non solo nascosti nell'app): bollette, budget, pagamenti, funzioni AI e gestione della famiglia non sono disponibili. Il genitore può **revocare l'accesso in qualsiasi momento** dalla scheda Famiglia; i punti e lo storico del profilo vengono conservati"),
      li("Per i profili di età inferiore ai 14 anni le **funzioni AI non sono disponibili**: il blocco è applicato dai nostri server e non dipende dalle impostazioni del dispositivo"),
      li("In fase di registrazione chiediamo solo una fascia di età, non la data di nascita, in linea con il principio di minimizzazione"),
      li("Se veniamo a conoscenza di aver raccolto dati di un minore di 14 anni senza il coinvolgimento di un genitore o tutore, provvederemo alla loro cancellazione tempestiva"),
      p("Un'informativa semplificata per ragazze e ragazzi, con un linguaggio adatto ai più giovani, è disponibile nell'app (Famiglia → Centro Privacy) e sul sito alla pagina https://familysync.eu/legal/minori."),
    ],
  },
  {
    title: "9. Categorie Particolari di Dati (Dati Sensibili)",
    blocks: [
      p("FamilySync non richiede e non è progettata per raccogliere categorie particolari di dati personali (art. 9 GDPR), come dati sulla salute, convinzioni religiose od opinioni politiche."),
      p("Tuttavia, i campi di testo libero (eventi, note, chat, faccende, liste) potrebbero contenere informazioni di questo tipo se scelte e inserite dagli utenti (ad esempio \"visita cardiologica\" nel calendario). Questi contenuti restano visibili solo alla famiglia, non vengono usati per altre finalità e ti invitiamo a inserirli solo se necessario. Ricorda che, se attivi le funzioni AI, alcuni titoli o testi liberi possono essere inviati al fornitore AI (vedi sezione 7)."),
    ],
  },
  {
    title: "10. Analytics Interna Temporanea (Periodo di Test)",
    blocks: [
      p("Durante il periodo di test dell'app può essere attiva una raccolta **interna e temporanea** di eventi tecnici minimi (es. apertura dell'app, schermata visitata, errori tecnici), utile a verificare stabilità e funzionamento."),
      p("Gli eventi analytics sono **dati personali di utilizzo** e possono essere associati a: ID utente, ID famiglia, schermate visitate, funzioni utilizzate, data e ora, piattaforma, versione dell'app ed errori tecnici. Nella dashboard amministrativa l'ID utente può essere collegato all'indirizzo email dell'account."),
      li("Non contengono il testo di chat, note, eventi, bollette o allegati, né password, token o dati di pagamento"),
      li("I metadati sono filtrati da una lista ristretta di campi tecnici ammessi"),
      li("Non vengono usati per pubblicità né per profilazione commerciale e non vengono venduti"),
      li("Gli eventi sono conservati al massimo **30 giorni** e poi cancellati automaticamente; alla cancellazione dell'account gli eventi associati all'utente vengono eliminati"),
      li("Sono visibili esclusivamente agli amministratori autorizzati, tramite un accesso protetto lato server; nessun dato è condiviso con terze parti"),
      li("Non vengono utilizzati SDK di analytics di terze parti né strumenti di tracciamento pubblicitario"),
      p("**Base giuridica:** legittimo interesse (art. 6.1.f GDPR) al miglioramento e alla stabilità del servizio. Puoi opporti scrivendo a assistenza@familysync.it."),
    ],
  },
  {
    title: "11. Pagamenti e Abbonamenti Premium",
    blocks: [
      p("Gli eventuali abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con la gestione degli abbonamenti e dei diritti (entitlements) affidata a **RevenueCat**:"),
      li("**Apple In-App Purchase / StoreKit** su iOS"),
      li("**Google Play Billing** su Android"),
      li("**RevenueCat** per la gestione di abbonamenti, stato dell'abbonamento ed entitlements"),
      p("I dati di pagamento (carte, ecc.) sono trattati direttamente da Apple o Google secondo le rispettive policy; FamilySync non ha accesso ai dati completi della tua carta."),
    ],
  },
  {
    title: "12. Notifiche",
    blocks: [
      li("**Notifiche locali:** programmate direttamente sul dispositivo (ad esempio i promemoria per le scadenze delle bollette); non richiedono l'invio dei contenuti a server esterni"),
      li("**Notifiche push remote:** se attivate, possono utilizzare un token push del dispositivo e i servizi di notifica di Expo/Apple/Google per recapitare gli avvisi"),
      li("**Notifiche push web:** se attivate dal browser, utilizzano il servizio push del browser stesso (Google, Apple, Mozilla o Microsoft) tramite una sottoscrizione revocabile in qualsiasi momento dalle impostazioni del browser"),
    ],
  },
  {
    title: "13. Sincronizzazione con Google Calendar (Facoltativa)",
    blocks: [
      p("FamilySync ti permette, se lo desideri, di **collegare il tuo account Google** per sincronizzare gli eventi del calendario familiare con il tuo Google Calendar personale. Il collegamento è facoltativo, avviene solo su tua iniziativa tramite la schermata di consenso di Google e riguarda esclusivamente il tuo account: gli altri membri della famiglia non sono coinvolti."),
      p("Se attivi il collegamento, trattiamo i seguenti dati:"),
      li("**Token di accesso Google (refresh token):** conservato sui nostri server **in forma cifrata**, usato esclusivamente per sincronizzare gli eventi con il tuo calendario"),
      li("**Email dell'account Google collegato:** conservata per mostrarti quale account risulta collegato"),
      li("**Eventi sincronizzati:** FamilySync **scrive, aggiorna e cancella nel tuo Google Calendar** gli eventi del calendario familiare (titolo, data, ora, luogo e descrizione) e conserva il riferimento tra l'evento FamilySync e l'evento creato su Google. FamilySync **non legge e non modifica** eventi del tuo calendario che non siano stati creati da FamilySync"),
      p("**Scollegamento e revoca:** puoi scollegare l'account Google in qualsiasi momento dalla stessa schermata dell'app. Allo scollegamento il token viene revocato ed eliminato dai nostri server e la sincronizzazione si interrompe. Puoi inoltre revocare l'accesso di FamilySync direttamente dal tuo account Google (https://myaccount.google.com/permissions)."),
      p("L'uso dei dati ricevuti dalle API di Google rispetta la **Google API Services User Data Policy**, inclusi i requisiti di Uso Limitato (Limited Use): i dati Google sono usati solo per fornire la sincronizzazione del calendario, non vengono usati per pubblicità e non vengono venduti o trasferiti a terzi se non nei casi consentiti dalla policy stessa."),
      p("**Base giuridica:** consenso esplicito dell'utente (art. 6.1.a GDPR), revocabile in qualsiasi momento senza pregiudicare la liceità del trattamento precedente."),
    ],
  },
  {
    title: "14. Fornitori e Condivisione con Terze Parti",
    blocks: [
      p("Per erogare il servizio ci avvaliamo dei seguenti fornitori, ciascuno per le sole finalità indicate:"),
      li("**Replit, Inc.:** hosting e deploy dell'applicazione e del backend"),
      li("**Neon, Inc. (PostgreSQL):** database in cui sono archiviati i dati"),
      li("**Resend (Plus Five Five, Inc.):** invio di email transazionali"),
      li("**OpenAI:** funzioni AI e trascrizione vocale, solo dati minimizzati e solo con il tuo consenso"),
      li("**RevenueCat, Inc.:** gestione di abbonamenti e acquisti in-app"),
      li("**Apple e Google:** acquisti in-app, login social (\"Accedi con Google\" / \"Sign in with Apple\"), sincronizzazione facoltativa con Google Calendar e servizi di notifica, secondo le proprie policy"),
      li("**Servizi di notifica push** (Expo e, per il web, i servizi push del browser di Google/Apple/Mozilla/Microsoft): recapito delle notifiche push, se attive"),
      p("Quando un fornitore tratta dati personali per conto di FamilySync, il rapporto è disciplinato, ove richiesto, da un accordo ai sensi dell'articolo 28 GDPR. Alcuni fornitori possono trattare determinati dati come titolari autonomi secondo le rispettive condizioni e informative."),
      p("Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalità di marketing."),
    ],
  },
  {
    title: "15. Trasferimenti Extra-SEE",
    blocks: [
      p("Alcuni fornitori (ad esempio OpenAI, Resend, RevenueCat, Apple, Google o Replit) hanno sede negli Stati Uniti o possono trattare i dati su infrastrutture situate al di fuori dello Spazio Economico Europeo (SEE)."),
      p("In questi casi i trasferimenti si basano sulle garanzie previste dal GDPR, secondo quanto dichiarato da ciascun fornitore nei propri termini e nelle proprie informative. Puoi chiederci maggiori informazioni sui trasferimenti scrivendo a assistenza@familysync.it."),
    ],
  },
  {
    title: "16. Conservazione dei Dati",
    blocks: [
      li("Dati dell'account → fino alla cancellazione dell'account"),
      li("Dati familiari (calendario, liste, faccende, chat, bollette, budget, ricette, allegati) → fino alla cancellazione della famiglia o dell'account"),
      li("Token di reset password → 1 ora"),
      li("Token di verifica email → 6 ore"),
      li("Token di invito familiare → 72 ore"),
      li("Sessioni / refresh token → 7 giorni"),
      li("Eventi di analytics interna di test → massimo 30 giorni"),
      li("Token Google Calendar (cifrato) ed email dell'account collegato → fino allo scollegamento dell'account Google o alla cancellazione dell'account FamilySync"),
      li("Registro dei consensi → per la durata dell'account e per il tempo necessario a dimostrare l'adempimento degli obblighi di legge"),
      li("Log di sistema → per il tempo strettamente necessario a finalità di sicurezza e diagnostica, secondo le impostazioni tecniche dei fornitori di hosting"),
      li("Registrazioni vocali per la trascrizione → non conservate sui nostri server"),
      p("I dati possono inoltre risiedere temporaneamente nei backup dell'infrastruttura del fornitore di database, gestiti secondo i cicli tecnici di quest'ultimo, e vengono rimossi con la naturale rotazione dei backup."),
    ],
  },
  {
    title: "17. Cancellazione dell'Account",
    blocks: [
      p("Puoi eliminare il tuo account in autonomia e in qualsiasi momento direttamente dall'app, nella scheda **Famiglia** → **Elimina account**, confermando con la tua password. In alternativa puoi richiedere la cancellazione scrivendo a assistenza@familysync.it."),
      p("Cosa succede in concreto:"),
      li("Il tuo profilo personale viene **reso anonimo**: nome ed email vengono rimossi e sostituiti, la password e i token di accesso vengono eliminati e non è più possibile accedere all'account"),
      li("Se sei l'**unico membro** di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, allegati, bollette e ricevute) vengono **eliminati definitivamente**, inclusi i file fisici allegati"),
      li("Se la famiglia ha **altri membri**, i contenuti che hai condiviso restano visibili agli altri in forma anonima (autore mostrato come \"Utente eliminato\"): questo tutela la continuità dei dati condivisi della famiglia"),
      p("L'eliminazione è definitiva e irreversibile. Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge. L'eliminazione dell'account non annulla automaticamente eventuali abbonamenti Premium, che vanno gestiti dallo store (Apple o Google). Maggiori dettagli alla pagina https://familysync.eu/legal/delete-account."),
    ],
  },
  {
    title: "18. Diritti dell'Utente",
    blocks: [
      p("In conformità con il GDPR (artt. 15-22), hai il diritto di:"),
      li("**Accesso:** richiedere una copia dei tuoi dati personali"),
      li("**Rettifica:** correggere dati inesatti o incompleti"),
      li("**Cancellazione:** richiedere la cancellazione dei tuoi dati"),
      li("**Portabilità:** ricevere i tuoi dati in un formato strutturato, di uso comune e leggibile da dispositivo automatico"),
      li("**Opposizione:** opporti ai trattamenti basati sul legittimo interesse (ad esempio l'analytics interna di test), per motivi connessi alla tua situazione particolare"),
      li("**Limitazione:** chiedere la limitazione del trattamento dei tuoi dati"),
      li("**Revoca del consenso:** revocare in qualsiasi momento i consensi prestati (ad esempio per le funzioni AI, dal Centro Privacy nell'app), senza pregiudicare la liceità del trattamento precedente"),
      li("**Reclamo:** proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)"),
      p("Per esercitare questi diritti scrivi a assistenza@familysync.it. Per proteggerti, prima di dare seguito a una richiesta potremmo doverti chiedere elementi per verificare la tua identità. Rispondiamo entro un mese dalla richiesta, prorogabile di due mesi nei casi complessi previsti dal GDPR. L'esportazione dei dati viene fornita tramite il canale email di assistenza."),
    ],
  },
  {
    title: "19. Violazioni dei Dati (Data Breach)",
    blocks: [
      p("In caso di violazione dei dati personali che presenti un rischio per i diritti e le libertà degli utenti, notificheremo la violazione al Garante per la protezione dei dati personali **entro 72 ore** dal momento in cui ne veniamo a conoscenza, come previsto dall'art. 33 GDPR."),
      p("Se la violazione presenta un rischio elevato per te, te ne daremo comunicazione senza ingiustificato ritardo (art. 34 GDPR), indicando la natura della violazione e le misure adottate."),
    ],
  },
  {
    title: "20. Cookie e Archiviazione Locale",
    blocks: [
      p("FamilySync **non utilizza cookie di profilazione né strumenti di tracciamento pubblicitario**, né su mobile né su web."),
      li("**App mobile:** i dati di sessione (token di accesso) e alcune preferenze sono salvati nella memoria locale del dispositivo per mantenerti collegato e far funzionare la modalità offline"),
      li("**Versione web:** il browser salva i dati di sessione e le preferenze nella memoria locale (localStorage), una tecnologia strettamente necessaria al funzionamento del servizio; non vengono usati cookie di terze parti"),
      li("Eliminando i dati del sito dal browser o disinstallando l'app, questi dati locali vengono rimossi"),
    ],
  },
  {
    title: "21. Sicurezza",
    blocks: [
      li("Password conservate esclusivamente in forma hashata con algoritmi robusti e mai in chiaro"),
      li("Comunicazioni protette tramite protocollo HTTPS/TLS"),
      li("Autenticazione basata su token a scadenza temporale"),
      li("Token sensibili (verifica, reset, inviti) conservati solo in forma hashata"),
      li("Rate limiting e protezioni contro gli abusi delle API"),
      li("Header di sicurezza HTTP e controlli di accesso per famiglia"),
    ],
  },
  {
    title: "22. Modifiche alla Privacy Policy",
    blocks: [
      p(`Questa è la versione ${PRIVACY_POLICY_VERSION} della Privacy Policy. Potremo aggiornarla in futuro: in caso di modifiche rilevanti lo comunicheremo tramite l'applicazione e/o via email, indicando la nuova versione e la data. Ti invitiamo a consultare periodicamente questa pagina.`),
    ],
  },
  {
    title: "23. Contatti",
    blocks: [
      p("Per qualsiasi domanda o richiesta relativa a questa Privacy Policy, puoi contattarci all'unico indirizzo:"),
      p("assistenza@familysync.it"),
    ],
  },
];
