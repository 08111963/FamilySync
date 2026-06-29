import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../lib/config';

const router = Router();

const LAST_UPDATED = "29 giugno 2026";
const APP_NAME = "FamilySync";
const OWNER = "Marino Pizzuti / FamilySync";
const CONTACT_EMAIL = "assistenza@familysync.it";

function getBaseUrl(req: Request): string {
  return config.getBaseUrl(req);
}

function htmlWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${APP_NAME}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fafafa;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #FF6B6B, #FF8E8E);
      padding: 48px 24px 32px;
      text-align: center;
    }
    .header h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .subtitle {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
    }
    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 28px 0 12px;
      color: #1a1a2e;
    }
    h2:first-child { margin-top: 0; }
    p, li {
      font-size: 15px;
      color: #333;
      margin-bottom: 10px;
    }
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    li { margin-bottom: 6px; }
    a { color: #FF6B6B; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .update-date {
      font-size: 13px;
      color: #888;
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 13px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">${APP_NAME}</div>
  </div>
  <div class="content">
    ${body}
    <p class="update-date">Ultimo aggiornamento: ${LAST_UPDATED}</p>
  </div>
  <div class="footer">&copy; 2026 ${OWNER}. Tutti i diritti riservati.</div>
</body>
</html>`;
}

router.get('/privacy', (_req: Request, res: Response) => {
  const body = `
    <h2>1. Titolare del Trattamento</h2>
    <p>Il titolare del trattamento dei dati personali e <strong>${OWNER}</strong>.</p>
    <p>Per qualsiasi domanda o richiesta relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    <p>Sito di riferimento: <a href="https://familysync.eu" target="_blank">https://familysync.eu</a></p>

    <h2>2. Dati Raccolti</h2>
    <p>${APP_NAME} raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:</p>
    <ul>
      <li><strong>Dati di account:</strong> nome, indirizzo email e password (conservata in forma crittografata con hashing, mai in chiaro)</li>
      <li><strong>Verifica e sicurezza account:</strong> token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica</li>
      <li><strong>Dati familiari:</strong> nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)</li>
      <li><strong>Eventi calendario:</strong> titoli, date, orari, luoghi e descrizioni degli eventi condivisi</li>
      <li><strong>Liste della spesa:</strong> nomi delle liste, articoli inseriti e relativo storico</li>
      <li><strong>Faccende domestiche:</strong> attivita assegnate, stato di completamento, punti accumulati</li>
      <li><strong>Chat e messaggi:</strong> contenuti dei messaggi scambiati tra i membri della famiglia ed eventuali file/immagini allegati</li>
      <li><strong>Allegati caricati dagli utenti:</strong> immagini e documenti caricati nell'app (ad esempio nelle chat o associati alle bollette)</li>
      <li><strong>Bollette e scadenze:</strong> titoli, categorie, importi, date di scadenza, fornitori, intestatari, responsabili, note, ricevute e allegati</li>
      <li><strong>Ripartizioni e pagamenti:</strong> suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente</li>
      <li><strong>Notifiche:</strong> preferenze di notifica e, se attive le notifiche push, il token push del dispositivo</li>
      <li><strong>Dati tecnici:</strong> informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione</li>
    </ul>

    <h2>3. Bollette e Scadenze</h2>
    <p>${APP_NAME} consente di registrare bollette e scadenze domestiche, inclusi importi, date di scadenza, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri della famiglia e allo storico dei pagamenti.</p>
    <p><strong>Importante:</strong> l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato "pagato" e i relativi importi sono registrazioni inserite manualmente dagli utenti a scopo organizzativo.</p>

    <h2>4. Finalita del Trattamento</h2>
    <p>I dati vengono raccolti e utilizzati per le seguenti finalita:</p>
    <ul>
      <li><strong>Erogazione del servizio:</strong> sincronizzazione familiare, gestione di calendario, liste della spesa, faccende, chat, bollette e scadenze</li>
      <li><strong>Comunicazioni di servizio:</strong> invio di email di verifica account, reset password, inviti familiari e comunicazioni essenziali</li>
      <li><strong>Notifiche:</strong> promemoria locali (ad esempio scadenze bollette) ed eventuali notifiche push remote</li>
      <li><strong>Suggerimenti intelligenti:</strong> generazione di consigli tramite intelligenza artificiale (funzionalita opzionale)</li>
      <li><strong>Miglioramento del servizio:</strong> analisi aggregate per migliorare le funzionalita dell'applicazione</li>
      <li><strong>Supporto tecnico e sicurezza:</strong> assistenza, prevenzione abusi e protezione degli account</li>
    </ul>

    <h2>5. Email Transazionali</h2>
    <p>${APP_NAME} invia email transazionali tramite il fornitore <strong>Resend</strong> per le seguenti finalita:</p>
    <ul>
      <li>verifica dell'account;</li>
      <li>inviti familiari;</li>
      <li>reset della password;</li>
      <li>comunicazioni essenziali relative al servizio.</li>
    </ul>
    <p>Le email <strong>non contengono mai la password</strong> dell'utente. I link di verifica e reset hanno una durata limitata nel tempo (vedi sezione Conservazione dei Dati).</p>

    <h2>6. Funzionalita di Intelligenza Artificiale (AI)</h2>
    <p>${APP_NAME} offre funzionalita opzionali basate sull'intelligenza artificiale tramite il fornitore <strong>OpenAI</strong>. L'uso e facoltativo, soggetto al tuo consenso e gestito tramite impostazioni e limiti di utilizzo (quote) dell'app; puo essere attivato o disattivato in qualsiasi momento.</p>
    <p><strong>I dati inviati a OpenAI sono minimizzati.</strong> Quando le funzioni AI sono attive vengono inviati, ad esempio:</p>
    <ul>
      <li><strong>Suggerimenti spesa:</strong> numero di membri (senza nomi), nomi dei prodotti recenti, titoli degli eventi in programma, stagione corrente</li>
      <li><strong>Ottimizzazione faccende:</strong> soprannomi dei membri, punti accumulati, titoli e durata stimata delle faccende</li>
      <li><strong>Insights familiari:</strong> conteggi aggregati (eventi, faccende completate/in sospeso), soprannome del miglior contributore, punti settimanali</li>
    </ul>
    <p><strong>Dati NON inviati a OpenAI:</strong> password, indirizzi email, dati di pagamento, allegati, ricevute, contenuti delle chat, indirizzi fisici o numeri di telefono.</p>
    <p>I dati inviati tramite l'API di OpenAI non vengono utilizzati per l'addestramento dei modelli, salvo diversa configurazione o opt-in esplicito. Il trattamento e regolato anche dalla <a href="https://openai.com/policies/privacy-policy" target="_blank">Privacy Policy di OpenAI</a>.</p>
    <p><strong>Base giuridica:</strong> consenso esplicito dell'utente, revocabile in qualsiasi momento disattivando la funzionalita nelle impostazioni.</p>

    <h2>7. Pagamenti e Abbonamenti Premium</h2>
    <p>Gli eventuali abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con la gestione degli abbonamenti e dei diritti (entitlements) affidata a <strong>RevenueCat</strong>:</p>
    <ul>
      <li><strong>Apple In-App Purchase / StoreKit</strong> su iOS;</li>
      <li><strong>Google Play Billing</strong> su Android;</li>
      <li><strong>RevenueCat</strong> per la gestione di abbonamenti, stato dell'abbonamento ed entitlements.</li>
    </ul>
    <p><strong>Stripe non e utilizzato</strong> per la vendita di Premium nell'app mobile. I dati di pagamento (carte, ecc.) sono trattati direttamente da Apple o Google secondo le rispettive policy; ${APP_NAME} non ha accesso ai dati completi della tua carta.</p>

    <h2>8. Notifiche</h2>
    <ul>
      <li><strong>Notifiche locali:</strong> programmate direttamente sul dispositivo (ad esempio i promemoria per le scadenze delle bollette); non richiedono l'invio dei contenuti a server esterni.</li>
      <li><strong>Notifiche push remote:</strong> se attivate, possono utilizzare un token push del dispositivo e i servizi di notifica di Expo/Apple/Google per recapitare gli avvisi.</li>
    </ul>

    <h2>9. Condivisione con Terze Parti e Fornitori</h2>
    <p>I dati possono essere trattati dai seguenti fornitori, esclusivamente per le finalita indicate:</p>
    <ul>
      <li><strong>Replit:</strong> hosting e deploy dell'applicazione e del backend</li>
      <li><strong>Neon / PostgreSQL:</strong> database in cui sono archiviati i dati</li>
      <li><strong>Resend:</strong> invio di email transazionali</li>
      <li><strong>OpenAI:</strong> generazione di suggerimenti AI (solo dati minimizzati, funzione opzionale)</li>
      <li><strong>RevenueCat, Apple, Google:</strong> gestione di abbonamenti e acquisti in-app</li>
      <li><strong>Servizi di notifica push</strong> (Expo/Apple/Google): recapito delle notifiche push, se attive</li>
    </ul>
    <p>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalita di marketing.</p>

    <h2>10. Trasferimenti Extra-UE</h2>
    <p>Alcuni fornitori (ad esempio OpenAI, Resend, RevenueCat, Apple, Google o Replit) possono trattare i dati su infrastrutture situate al di fuori dello Spazio Economico Europeo (SEE). In tali casi, i trasferimenti avvengono adottando garanzie adeguate ove applicabile (ad esempio le Clausole Contrattuali Standard della Commissione Europea o meccanismi equivalenti).</p>

    <h2>11. Conservazione dei Dati</h2>
    <ul>
      <li>I dati dell'account sono conservati fino alla cancellazione dell'account</li>
      <li>I dati familiari (calendario, liste, faccende, chat, bollette, allegati, ricevute) sono conservati fino alla cancellazione della famiglia o dell'account</li>
      <li>I token di reset password scadono dopo <strong>1 ora</strong></li>
      <li>I token di verifica email scadono dopo <strong>6 ore</strong></li>
      <li>I token di invito familiare scadono dopo <strong>72 ore</strong>; gli inviti scaduti o gia utilizzati non sono piu validi</li>
      <li>Le sessioni / refresh token scadono dopo <strong>7 giorni</strong></li>
      <li>I log di sistema sono conservati per il tempo necessario, fino a un massimo di 12 mesi</li>
    </ul>

    <h2>12. Sicurezza</h2>
    <ul>
      <li>Crittografia delle password con algoritmo bcrypt</li>
      <li>Comunicazioni protette tramite protocollo HTTPS/TLS</li>
      <li>Autenticazione basata su token JWT con scadenza temporale</li>
      <li>Rate limiting per prevenire abusi delle API</li>
      <li>Headers di sicurezza HTTP (Helmet)</li>
    </ul>

    <h2>13. Diritti dell'Utente</h2>
    <p>In conformita con la normativa vigente (incluso il GDPR), hai il diritto di:</p>
    <ul>
      <li><strong>Accesso:</strong> richiedere una copia dei tuoi dati personali</li>
      <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti</li>
      <li><strong>Cancellazione:</strong> richiedere la cancellazione dei tuoi dati</li>
      <li><strong>Portabilita:</strong> ricevere i tuoi dati in formato strutturato e leggibile</li>
      <li><strong>Opposizione:</strong> opporti al trattamento in determinate circostanze</li>
      <li><strong>Limitazione:</strong> chiedere la limitazione del trattamento dei tuoi dati</li>
      <li><strong>Revoca del consenso:</strong> revocare in qualsiasi momento i consensi prestati (ad esempio per le funzioni AI), senza pregiudicare la liceita del trattamento precedente</li>
      <li><strong>Reclamo:</strong> proporre reclamo al Garante per la protezione dei dati personali</li>
    </ul>
    <p>Per esercitare questi diritti, scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

    <h2>14. Cancellazione dell'Account</h2>
    <p>Puoi eliminare il tuo account in autonomia e in qualsiasi momento direttamente dall'app, nella scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>, confermando con la tua password. In alternativa puoi richiedere la cancellazione scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    <p>Con l'eliminazione, il tuo profilo personale viene reso anonimo e le tue informazioni di contatto vengono rimosse. Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, allegati, bollette e ricevute) vengono eliminati. I contenuti condivisi in famiglie con altri membri possono restare visibili agli altri, ma in forma anonima (autore mostrato come "Utente eliminato").</p>
    <p>L'eliminazione e definitiva e irreversibile. Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge. L'eliminazione dell'account non annulla automaticamente eventuali abbonamenti Premium, che vanno gestiti dallo store (Apple o Google). Maggiori dettagli sono disponibili alla pagina dedicata all'<a href="${getBaseUrl(_req)}/legal/delete-account">eliminazione dell'account</a>.</p>

    <h2>15. Minori</h2>
    <p>${APP_NAME} e un'applicazione per il coordinamento familiare. L'utilizzo da parte di minori di 14 anni e consentito esclusivamente sotto la supervisione e con il consenso di un genitore o tutore legale che sia gia membro della famiglia nell'applicazione.</p>
    <p>Non raccogliamo consapevolmente dati personali di minori di 14 anni senza il consenso verificabile di un genitore o tutore. Se veniamo a conoscenza di aver raccolto dati di un minore senza il consenso appropriato, provvederemo alla loro cancellazione tempestiva.</p>

    <h2>16. Modifiche alla Privacy Policy</h2>
    <p>Ci riserviamo il diritto di aggiornare questa Privacy Policy in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione della nuova Privacy Policy.</p>

    <h2>17. Contatti</h2>
    <p>Per qualsiasi domanda o richiesta relativa a questa Privacy Policy, puoi contattarci all'unico indirizzo:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper('Privacy Policy', body));
});

router.get('/terms', (_req: Request, res: Response) => {
  const body = `
    <h2>1. Accettazione dei Termini</h2>
    <p>Utilizzando ${APP_NAME}, accetti di essere vincolato dai presenti Termini d'Uso. Se non accetti questi termini, ti preghiamo di non utilizzare l'applicazione.</p>

    <h2>2. Descrizione del Servizio</h2>
    <p>${APP_NAME} e un'applicazione per il coordinamento familiare che consente ai membri di una famiglia di:</p>
    <ul>
      <li>Gestire un calendario condiviso</li>
      <li>Creare e condividere liste della spesa</li>
      <li>Organizzare e assegnare faccende domestiche con un sistema di punti</li>
      <li>Tenere traccia delle bollette e delle scadenze domestiche, con possibilita di allegare documenti</li>
      <li>Pianificare ricette e menu settimanali</li>
      <li>Comunicare tramite una chat interna con messaggi, immagini e allegati</li>
      <li>Ricevere suggerimenti intelligenti basati sull'intelligenza artificiale</li>
      <li>Sincronizzare le informazioni in tempo reale tra tutti i dispositivi</li>
    </ul>

    <h2>3. Account e Registrazione</h2>
    <ul>
      <li>Per utilizzare ${APP_NAME} e necessario creare un account fornendo un indirizzo email valido, un nome e una password</li>
      <li>Sei responsabile della riservatezza delle tue credenziali di accesso</li>
      <li>Devi avere almeno 14 anni per creare un account. I minori di 14 anni possono utilizzare l'app solo sotto la supervisione di un genitore/tutore</li>
      <li>Le informazioni fornite durante la registrazione devono essere accurate e aggiornate</li>
    </ul>

    <h2>4. Gruppi Familiari</h2>
    <ul>
      <li>L'utente che crea un gruppo familiare ne diventa automaticamente l'amministratore</li>
      <li>Gli amministratori possono invitare nuovi membri, rimuovere membri esistenti e gestire le impostazioni del gruppo</li>
      <li>I contenuti inseriti all'interno di un gruppo familiare (eventi, liste, faccende) sono visibili a tutti i membri del gruppo</li>
      <li>L'uscita da un gruppo familiare non comporta la cancellazione dei contenuti precedentemente condivisi</li>
    </ul>

    <h2>5. Responsabilita dei Contenuti (UGC)</h2>
    <p>L'utente e l'unico responsabile dei contenuti inseriti nell'applicazione (contenuti generati dagli utenti, "UGC"), inclusi ma non limitati a:</p>
    <ul>
      <li>Nomi degli eventi e relative descrizioni</li>
      <li>Articoli nelle liste della spesa</li>
      <li>Descrizioni delle faccende domestiche</li>
      <li>Messaggi, immagini e allegati inviati nella chat</li>
      <li>Bollette, importi e documenti allegati</li>
      <li>Ricette e piani pasti</li>
      <li>Informazioni del profilo e del gruppo familiare</li>
    </ul>
    <p>I contenuti non devono essere illegali, offensivi, diffamatori o in violazione dei diritti di terzi.</p>
    <p>${APP_NAME} non effettua un monitoraggio preventivo dei contenuti generati dagli utenti, ma si riserva il diritto di rimuovere contenuti che violino i presenti Termini a seguito di segnalazione o controllo.</p>
    <p><strong>Licenza limitata sui contenuti:</strong> l'utente mantiene la piena titolarita dei propri contenuti. Caricando contenuti, l'utente concede a ${APP_NAME} una licenza limitata, non esclusiva, gratuita e revocabile, valida per la sola durata dell'utilizzo del servizio e al solo scopo di erogare le funzionalita dell'app (ad esempio archiviazione, sincronizzazione tra dispositivi e condivisione con gli altri membri della famiglia). Questa licenza non attribuisce a ${APP_NAME} alcun diritto di utilizzare i contenuti per finalita diverse e cessa al momento della rimozione dei contenuti o dell'eliminazione dell'account, salvo i contenuti gia condivisi con altri membri o gli obblighi di conservazione previsti dalla legge.</p>

    <h2>6. Chat e Allegati</h2>
    <p>L'app include una chat interna che consente ai membri della stessa famiglia di scambiarsi messaggi di testo, immagini e file allegati.</p>
    <ul>
      <li>I messaggi e gli allegati sono visibili a tutti i membri del gruppo familiare</li>
      <li>L'utente e responsabile dei contenuti che invia e non deve caricare materiale illegale, offensivo o in violazione di diritti altrui</li>
      <li>Gli allegati sono soggetti a limiti di dimensione e di tipo di file (sono ammesse immagini e documenti, con un limite massimo per file)</li>
      <li>I messaggi degli utenti bloccati non vengono mostrati al membro che ha effettuato il blocco</li>
      <li>I file allegati vengono conservati sui nostri server per consentire la visualizzazione. Se l'utente e l'unico membro di una famiglia e la famiglia viene eliminata, vengono rimossi anche gli allegati fisici collegati, come immagini della chat, documenti delle bollette e avatar. Se invece la famiglia continua a esistere con altri membri, i contenuti e gli allegati gia condivisi possono restare disponibili agli altri membri in forma associata a "Utente eliminato"</li>
    </ul>

    <h2>7. Gestione Bollette e Scadenze</h2>
    <p>${APP_NAME} offre uno strumento per annotare bollette, importi e scadenze domestiche e per allegare documenti relativi.</p>
    <ul>
      <li><strong>${APP_NAME} NON elabora pagamenti reali:</strong> la funzione bollette ha finalita esclusivamente organizzativa e di promemoria. L'app non esegue, non gestisce e non intermedia alcun pagamento verso fornitori o terzi</li>
      <li>L'app <strong>non richiede e non deve essere utilizzata per inserire dati di pagamento sensibili</strong> come numeri di carta di credito, codici CVV, coordinate bancarie complete o IBAN. Si invita l'utente a non inserire tali dati nei campi di testo o negli allegati</li>
      <li>Gli importi e le scadenze inseriti sono semplici annotazioni a cura dell'utente: ${APP_NAME} non ne garantisce l'esattezza e non e responsabile di mancati pagamenti, more o penali</li>
      <li>L'utente resta l'unico responsabile del pagamento effettivo delle proprie bollette presso i rispettivi fornitori</li>
    </ul>

    <h2>8. Funzionalita di Intelligenza Artificiale</h2>
    <p>${APP_NAME} offre funzionalita basate sull'intelligenza artificiale (ad esempio suggerimenti per la spesa, ottimizzazione delle faccende e proposte di ricette o piani pasti).</p>
    <ul>
      <li>Le funzionalita AI sono <strong>facoltative</strong> e vengono attivate solo previo consenso dell'utente, modificabile in qualsiasi momento dalle impostazioni</li>
      <li>Per fornire i suggerimenti, alcuni dati pertinenti possono essere inviati a fornitori terzi di servizi AI; non vengono inviati piu dati del necessario</li>
      <li>I contenuti generati dall'AI hanno <strong>natura puramente indicativa e possono essere imprecisi, incompleti o non aggiornati</strong>. Non costituiscono consigli professionali (medici, nutrizionali, finanziari o di altro tipo)</li>
      <li>L'utente e tenuto a valutare in autonomia i suggerimenti prima di agire: ${APP_NAME} non e responsabile delle decisioni assunte sulla base dei contenuti generati dall'AI</li>
      <li>L'uso dell'AI puo essere soggetto a limiti di utilizzo (quota) differenziati tra piano Free e Premium</li>
    </ul>

    <h2>9. Segnalazione e Moderazione Contenuti</h2>
    <p>Per garantire un ambiente sicuro e rispettoso per tutte le famiglie, ${APP_NAME} offre strumenti di segnalazione e moderazione:</p>
    <ul>
      <li><strong>Segnalazione contenuti:</strong> ogni membro della famiglia puo segnalare contenuti (eventi, articoli spesa, faccende, messaggi chat) o utenti che ritiene inappropriati, offensivi o in violazione dei Termini</li>
      <li><strong>Categorie di segnalazione:</strong> spam, molestie, odio, contenuti sessuali, violenza, altro</li>
      <li><strong>Gestione segnalazioni:</strong> le segnalazioni vengono esaminate dagli amministratori del gruppo familiare, che possono prendere provvedimenti (azione o archiviazione)</li>
      <li><strong>Blocco utenti:</strong> ogni membro puo bloccare un altro membro all'interno della propria famiglia. I contenuti degli utenti bloccati non saranno piu visibili al membro che ha effettuato il blocco</li>
      <li><strong>Sblocco:</strong> e possibile sbloccare un utente in qualsiasi momento dalle impostazioni</li>
    </ul>
    <p>L'abuso del sistema di segnalazione (segnalazioni false o ripetute in malafede) puo comportare la sospensione dell'account.</p>

    <h2>10. Uso Corretto</h2>
    <p>L'utente si impegna a:</p>
    <ul>
      <li>Utilizzare l'applicazione esclusivamente per le finalita previste di coordinamento familiare</li>
      <li>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</li>
      <li>Non utilizzare sistemi automatizzati (bot, scraper) per interagire con il servizio</li>
      <li>Non tentare di compromettere la sicurezza o la stabilita dell'applicazione</li>
      <li>Rispettare le leggi applicabili durante l'utilizzo del servizio</li>
    </ul>

    <h2>11. Divieti</h2>
    <p>E espressamente vietato:</p>
    <ul>
      <li>Creare account falsi o multipli per finalita abusive</li>
      <li>Utilizzare il servizio per attivita commerciali non autorizzate</li>
      <li>Distribuire malware o contenuti dannosi attraverso l'applicazione</li>
      <li>Tentare di effettuare ingegneria inversa del software</li>
      <li>Interferire con il funzionamento dell'applicazione o dei suoi server</li>
    </ul>

    <h2>12. Piani Free e Premium e Abbonamenti</h2>
    <p>${APP_NAME} e disponibile in un piano <strong>Free</strong> gratuito e in un piano <strong>Premium</strong> a pagamento, attivabile tramite abbonamento.</p>
    <ul>
      <li><strong>Piano Free:</strong> consente l'utilizzo delle funzionalita di base, con alcuni limiti (ad esempio quota di utilizzo delle funzionalita AI)</li>
      <li><strong>Piano Premium:</strong> sblocca funzionalita aggiuntive e limiti piu ampi. Prezzi e durata dell'abbonamento sono indicati all'interno dell'app al momento dell'acquisto</li>
      <li><strong>Acquisti su mobile:</strong> gli abbonamenti Premium sulle app mobili vengono gestiti tramite i sistemi di pagamento degli store ufficiali, ovvero <strong>Apple App Store (StoreKit)</strong> su iOS e <strong>Google Play Billing</strong> su Android, con il supporto tecnico del fornitore <strong>RevenueCat</strong> per la gestione degli abbonamenti</li>
      <li>L'addebito, il rinnovo automatico e la gestione o cancellazione dell'abbonamento avvengono tramite l'account dello store (Apple o Google). Per disdire occorre agire nelle impostazioni del proprio account store; la disinstallazione dell'app non annulla l'abbonamento</li>
      <li>I rimborsi sono soggetti alle politiche dello store di riferimento (Apple o Google)</li>
      <li><strong>Stripe NON viene utilizzato</strong> per attivare o gestire il Premium sulle app mobili: eventuali pagamenti tramite Stripe non sbloccano le funzionalita Premium dell'app mobile</li>
    </ul>

    <h2>13. Sospensione e Chiusura Account</h2>
    <p>Ci riserviamo il diritto di:</p>
    <ul>
      <li>Sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini</li>
      <li>Rimuovere contenuti che violino le nostre politiche o le leggi applicabili</li>
      <li>Interrompere il servizio con un preavviso ragionevole</li>
    </ul>
    <p>L'utente puo eliminare il proprio account in qualsiasi momento direttamente dall'app (scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>), anche se l'indirizzo email non e ancora stato verificato, oppure contattandoci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. L'eliminazione e definitiva: comporta l'anonimizzazione del profilo e, se l'utente e l'unico membro di una famiglia, la cancellazione della famiglia e dei relativi contenuti, inclusi i file fisici allegati (immagini della chat, documenti delle bollette e avatar). I contenuti gia condivisi con una famiglia che continua a esistere con altri membri possono restare visibili in forma anonima. L'eliminazione dell'account non annulla eventuali abbonamenti Premium, che vanno gestiti separatamente dallo store (Apple o Google).</p>

    <h2>14. Limitazioni di Responsabilita</h2>
    <p>Nei limiti consentiti dalla legge applicabile:</p>
    <ul>
      <li>Il servizio viene fornito "cosi com'e" e "come disponibile", senza garanzie di alcun tipo, espresse o implicite</li>
      <li>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</li>
      <li>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</li>
      <li>La nostra responsabilita massima e limitata all'importo pagato dall'utente per il servizio nei 12 mesi precedenti l'evento</li>
    </ul>
    <p>Nessuna disposizione dei presenti Termini esclude o limita la responsabilita nei casi in cui cio non sia consentito dalla legge, inclusi i diritti inderogabili riconosciuti ai consumatori.</p>

    <h2>15. Proprieta Intellettuale</h2>
    <p>Tutti i diritti di proprieta intellettuale relativi a ${APP_NAME}, inclusi design, codice, marchi e contenuti originali, sono di proprieta esclusiva di ${OWNER}. L'utente non acquisisce alcun diritto di proprieta intellettuale sull'applicazione. Restano salvi i diritti dell'utente sui propri contenuti (UGC) e la licenza limitata descritta alla sezione 5.</p>

    <h2>16. Legge Applicabile e Foro Competente</h2>
    <p>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia derivante dall'utilizzo del servizio, sara competente il Foro del luogo di residenza del consumatore, in conformita con il Codice del Consumo italiano.</p>

    <h2>17. Modifiche ai Termini</h2>
    <p>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</p>

    <h2>18. Contatti</h2>
    <p>Per qualsiasi domanda o segnalazione relativa ai presenti Termini d'Uso:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper("Termini d'Uso", body));
});

router.get('/delete-account', (_req: Request, res: Response) => {
  const body = `
    <h2>Come eliminare il tuo account ${APP_NAME}</h2>
    <p>Questa pagina spiega come eliminare il tuo account ${APP_NAME} e quali dati vengono rimossi. L'eliminazione e <strong>definitiva e irreversibile</strong>.</p>

    <h2>1. Eliminazione direttamente dall'app (consigliato)</h2>
    <p>Puoi eliminare il tuo account in autonomia, in qualsiasi momento, direttamente dall'applicazione:</p>
    <ul>
      <li>Apri l'app e accedi al tuo account</li>
      <li>Vai nella scheda <strong>Famiglia</strong></li>
      <li>Scorri fino in fondo e tocca <strong>Elimina account</strong></li>
      <li>Inserisci la tua password e digita <strong>ELIMINA</strong> per confermare</li>
    </ul>
    <p>Al termine verrai disconnesso automaticamente da tutti i dispositivi.</p>

    <h2>2. Eliminazione tramite richiesta via email</h2>
    <p>Se non riesci ad accedere all'app, puoi richiedere l'eliminazione scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> dall'indirizzo email associato al tuo account. Daremo seguito alla richiesta nei tempi previsti dalla normativa applicabile.</p>

    <h2>3. Quali dati vengono eliminati</h2>
    <ul>
      <li>Il tuo profilo personale viene reso anonimo e le tue informazioni di contatto (email, nome, foto) vengono rimosse</li>
      <li>Se sei l'unico membro di una famiglia, quella famiglia e tutti i suoi dati vengono eliminati: calendario, liste della spesa, faccende, chat e allegati, bollette, scadenze e ricevute</li>
      <li>I token di accesso, i token di verifica/reset e i token push del dispositivo vengono eliminati</li>
      <li>Eventuali blocchi e inviti collegati al tuo account vengono rimossi</li>
    </ul>

    <h2>4. Quali dati possono essere conservati</h2>
    <ul>
      <li>I contenuti che hai condiviso in famiglie con altri membri (ad esempio eventi o messaggi) possono restare visibili agli altri membri, ma senza il tuo nome (autore mostrato come "Utente eliminato")</li>
      <li>Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge, contabili o di sicurezza, e i log di sistema fino a un massimo di 12 mesi</li>
    </ul>

    <h2>5. Abbonamenti Premium</h2>
    <p>L'eliminazione dell'account <strong>non annulla automaticamente</strong> un eventuale abbonamento Premium. Gli abbonamenti sono gestiti dallo store. Per non essere piu addebitato, annulla l'abbonamento dalle impostazioni del tuo account:</p>
    <ul>
      <li><strong>iOS:</strong> Impostazioni &rarr; il tuo nome &rarr; Abbonamenti</li>
      <li><strong>Android:</strong> Google Play Store &rarr; Pagamenti e abbonamenti &rarr; Abbonamenti</li>
    </ul>

    <h2>6. Tempi</h2>
    <p>L'eliminazione effettuata dall'app e immediata. Le richieste via email vengono evase nei tempi previsti dalla normativa applicabile.</p>

    <h2>7. Contatti</h2>
    <p>Per qualsiasi domanda relativa all'eliminazione del tuo account, scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper("Eliminazione Account", body));
});

export default router;
