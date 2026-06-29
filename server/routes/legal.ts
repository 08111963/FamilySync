import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../lib/config';

const router = Router();

const LAST_UPDATED = "29 giugno 2026";
const APP_NAME = "FamilySync";
const DEVELOPER = "FamilySync Team";
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
  <div class="footer">&copy; 2026 ${DEVELOPER}. Tutti i diritti riservati.</div>
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
    <p>Puoi richiedere la cancellazione del tuo account e dei dati associati scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Daremo seguito alla richiesta nei tempi previsti dalla normativa applicabile, salvo eventuali obblighi di legge che impongano una conservazione piu lunga.</p>

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
      <li>Informazioni del profilo e del gruppo familiare</li>
    </ul>
    <p>I contenuti non devono essere illegali, offensivi, diffamatori o in violazione dei diritti di terzi.</p>
    <p>${APP_NAME} non effettua un monitoraggio preventivo dei contenuti generati dagli utenti, ma si riserva il diritto di rimuovere contenuti che violino i presenti Termini a seguito di segnalazione o controllo.</p>

    <h2>6. Segnalazione e Moderazione Contenuti</h2>
    <p>Per garantire un ambiente sicuro e rispettoso per tutte le famiglie, ${APP_NAME} offre strumenti di segnalazione e moderazione:</p>
    <ul>
      <li><strong>Segnalazione contenuti:</strong> ogni membro della famiglia puo segnalare contenuti (eventi, articoli spesa, faccende) o utenti che ritiene inappropriati, offensivi o in violazione dei Termini</li>
      <li><strong>Categorie di segnalazione:</strong> spam, molestie, odio, contenuti sessuali, violenza, altro</li>
      <li><strong>Gestione segnalazioni:</strong> le segnalazioni vengono esaminate dagli amministratori del gruppo familiare, che possono prendere provvedimenti (azione o archiviazione)</li>
      <li><strong>Blocco utenti:</strong> ogni membro puo bloccare un altro membro all'interno della propria famiglia. I contenuti degli utenti bloccati non saranno piu visibili al membro che ha effettuato il blocco</li>
      <li><strong>Sblocco:</strong> e possibile sbloccare un utente in qualsiasi momento dalle impostazioni</li>
    </ul>
    <p>L'abuso del sistema di segnalazione (segnalazioni false o ripetute in malafede) puo comportare la sospensione dell'account.</p>

    <h2>7. Uso Corretto</h2>
    <p>L'utente si impegna a:</p>
    <ul>
      <li>Utilizzare l'applicazione esclusivamente per le finalita previste di coordinamento familiare</li>
      <li>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</li>
      <li>Non utilizzare sistemi automatizzati (bot, scraper) per interagire con il servizio</li>
      <li>Non tentare di compromettere la sicurezza o la stabilita dell'applicazione</li>
      <li>Rispettare le leggi applicabili durante l'utilizzo del servizio</li>
    </ul>

    <h2>8. Divieti</h2>
    <p>E espressamente vietato:</p>
    <ul>
      <li>Creare account falsi o multipli per finalita abusive</li>
      <li>Utilizzare il servizio per attivita commerciali non autorizzate</li>
      <li>Distribuire malware o contenuti dannosi attraverso l'applicazione</li>
      <li>Tentare di effettuare ingegneria inversa del software</li>
      <li>Interferire con il funzionamento dell'applicazione o dei suoi server</li>
    </ul>

    <h2>9. Sospensione e Chiusura Account</h2>
    <p>Ci riserviamo il diritto di:</p>
    <ul>
      <li>Sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini</li>
      <li>Rimuovere contenuti che violino le nostre politiche o le leggi applicabili</li>
      <li>Interrompere il servizio con un preavviso ragionevole</li>
    </ul>
    <p>L'utente puo chiudere il proprio account in qualsiasi momento contattandoci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

    <h2>10. Abbonamenti Premium</h2>
    <p>${APP_NAME} offre funzionalita premium a pagamento. I dettagli specifici relativi a prezzi, modalita di pagamento e politica di rimborso verranno comunicati al momento dell'attivazione del servizio di pagamento. L'utilizzo delle funzionalita base dell'applicazione rimane gratuito.</p>

    <h2>11. Limitazioni di Responsabilita</h2>
    <ul>
      <li>Il servizio viene fornito "cosi com'e" senza garanzie di alcun tipo, espresse o implicite</li>
      <li>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</li>
      <li>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</li>
      <li>La nostra responsabilita massima e limitata all'importo pagato dall'utente per il servizio nei 12 mesi precedenti l'evento</li>
    </ul>

    <h2>12. Proprieta Intellettuale</h2>
    <p>Tutti i diritti di proprieta intellettuale relativi a ${APP_NAME}, inclusi design, codice, marchi e contenuti originali, sono di proprieta esclusiva di ${DEVELOPER}. L'utente non acquisisce alcun diritto di proprieta intellettuale sull'applicazione.</p>

    <h2>13. Legge Applicabile e Foro Competente</h2>
    <p>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia derivante dall'utilizzo del servizio, sara competente il Foro del luogo di residenza del consumatore, in conformita con il Codice del Consumo italiano.</p>

    <h2>14. Modifiche ai Termini</h2>
    <p>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</p>

    <h2>15. Contatti</h2>
    <p>Per qualsiasi domanda o segnalazione relativa ai presenti Termini d'Uso:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper("Termini d'Uso", body));
});

export default router;
