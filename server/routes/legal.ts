import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../lib/config';

const router = Router();

const LAST_UPDATED = "7 febbraio 2026";
const APP_NAME = "FamilySync";
const DEVELOPER = "FamilySync Team";
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
    <p>Il titolare del trattamento dei dati personali e <strong>${DEVELOPER}</strong>.</p>
    <p>Per qualsiasi domanda o richiesta relativa alla privacy, puoi contattarci all'indirizzo email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

    <h2>2. Dati Raccolti</h2>
    <p>${APP_NAME} raccoglie e tratta i seguenti dati personali:</p>
    <ul>
      <li><strong>Dati di account:</strong> nome, indirizzo email e password (conservata in forma crittografata)</li>
      <li><strong>Dati familiari:</strong> nomi dei membri della famiglia, ruoli all'interno del gruppo familiare</li>
      <li><strong>Eventi calendario:</strong> titoli, date, orari, luoghi e descrizioni degli eventi condivisi</li>
      <li><strong>Liste della spesa:</strong> nomi delle liste e articoli inseriti</li>
      <li><strong>Faccende domestiche:</strong> attivita assegnate, stato di completamento, punti accumulati</li>
      <li><strong>Dati tecnici:</strong> informazioni sul dispositivo, log di accesso, token di sessione</li>
    </ul>

    <h2>3. Finalita del Trattamento</h2>
    <p>I dati vengono raccolti e utilizzati per le seguenti finalita:</p>
    <ul>
      <li><strong>Erogazione del servizio:</strong> consentire la sincronizzazione familiare, la gestione di eventi, liste della spesa e faccende</li>
      <li><strong>Comunicazioni di servizio:</strong> invio di email di verifica account, notifiche di reset password e comunicazioni essenziali relative al servizio</li>
      <li><strong>Suggerimenti intelligenti:</strong> generazione di consigli personalizzati tramite intelligenza artificiale per ottimizzare la gestione domestica (funzionalita opzionale)</li>
      <li><strong>Miglioramento del servizio:</strong> analisi aggregate per migliorare le funzionalita dell'applicazione</li>
      <li><strong>Supporto tecnico:</strong> assistenza nella risoluzione di problemi segnalati dagli utenti</li>
    </ul>

    <h2>4. Funzionalita di Intelligenza Artificiale (AI)</h2>
    <p>${APP_NAME} offre funzionalita opzionali basate sull'intelligenza artificiale tramite il servizio OpenAI. L'utilizzo di queste funzionalita e completamente facoltativo e puo essere attivato o disattivato in qualsiasi momento nelle impostazioni dell'app.</p>
    <p><strong>Dati inviati a OpenAI quando le funzionalita AI sono attive:</strong></p>
    <ul>
      <li><strong>Suggerimenti spesa:</strong> numero di membri familiari (senza nomi), nomi dei prodotti acquistati di recente, titoli degli eventi in programma, stagione corrente</li>
      <li><strong>Ottimizzazione faccende:</strong> soprannomi dei membri, punti accumulati, titoli e durata stimata delle faccende</li>
      <li><strong>Insights familiari:</strong> conteggi aggregati (numero eventi, faccende completate/in sospeso), soprannome del miglior contributore, punti settimanali</li>
    </ul>
    <p><strong>Dati NON inviati a OpenAI:</strong> indirizzi email, password, indirizzi fisici, numeri di telefono, dati di pagamento, contenuto delle descrizioni di eventi o faccende.</p>
    <p>I dati inviati a OpenAI sono trattati secondo la <a href="https://openai.com/policies/privacy-policy" target="_blank">Privacy Policy di OpenAI</a> e non vengono utilizzati per addestrare i modelli AI.</p>
    <p><strong>Base giuridica:</strong> il trattamento dei dati tramite AI avviene sulla base del tuo consenso esplicito, che puoi revocare in qualsiasi momento disattivando la funzionalita nelle impostazioni.</p>

    <h2>5. Condivisione con Terze Parti</h2>
    <p>I dati personali possono essere condivisi con i seguenti fornitori di servizi, esclusivamente per le finalita sopra indicate:</p>
    <ul>
      <li><strong>Provider di hosting e database:</strong> i dati sono archiviati su server sicuri gestiti da provider cloud affidabili (Neon/PostgreSQL)</li>
      <li><strong>Servizio email:</strong> per l'invio di email transazionali (verifica account, reset password)</li>
      <li><strong>OpenAI:</strong> per la generazione di suggerimenti AI (solo dati aggregati come descritto alla sezione 4, funzionalita attivabile/disattivabile dall'utente)</li>
      <li><strong>Stripe:</strong> per l'elaborazione dei pagamenti relativi ad abbonamenti Premium. Nota: il servizio di pagamento non e attualmente attivo e verra comunicato al momento della sua eventuale attivazione</li>
    </ul>
    <p>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalita di marketing.</p>

    <h2>6. Conservazione dei Dati</h2>
    <p>I dati personali vengono conservati per il tempo necessario a fornire il servizio e per adempiere agli obblighi di legge. In particolare:</p>
    <ul>
      <li>I dati dell'account vengono conservati fino alla cancellazione dell'account da parte dell'utente</li>
      <li>I dati familiari condivisi vengono conservati finche la famiglia rimane attiva nell'applicazione</li>
      <li>I log di accesso vengono conservati per un massimo di 12 mesi</li>
      <li>I token di sessione scadono automaticamente dopo 7 giorni di inattivita</li>
    </ul>

    <h2>7. Sicurezza</h2>
    <p>Adottiamo misure di sicurezza tecniche e organizzative adeguate per proteggere i dati personali, tra cui:</p>
    <ul>
      <li>Crittografia delle password con algoritmo bcrypt</li>
      <li>Comunicazioni protette tramite protocollo HTTPS/TLS</li>
      <li>Autenticazione basata su token JWT con scadenza temporale</li>
      <li>Rate limiting per prevenire abusi delle API</li>
      <li>Headers di sicurezza HTTP (Helmet)</li>
    </ul>

    <h2>8. Diritti dell'Utente</h2>
    <p>In conformita con la normativa vigente (incluso il GDPR), hai il diritto di:</p>
    <ul>
      <li><strong>Accesso:</strong> richiedere una copia dei tuoi dati personali</li>
      <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti</li>
      <li><strong>Cancellazione:</strong> richiedere la cancellazione dei tuoi dati personali</li>
      <li><strong>Portabilita:</strong> ricevere i tuoi dati in formato strutturato e leggibile</li>
      <li><strong>Opposizione:</strong> opporti al trattamento dei tuoi dati in determinate circostanze</li>
    </ul>
    <p>Per esercitare questi diritti, contattaci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

    <h2>9. Minori</h2>
    <p>${APP_NAME} e un'applicazione per il coordinamento familiare. L'utilizzo dell'app da parte di minori di 14 anni e consentito esclusivamente sotto la supervisione e con il consenso di un genitore o tutore legale che sia gia membro della famiglia nell'applicazione.</p>
    <p>Non raccogliamo consapevolmente dati personali di minori di 14 anni senza il consenso verificabile di un genitore o tutore. Se veniamo a conoscenza di aver raccolto dati di un minore senza il consenso appropriato, provvederemo alla loro cancellazione tempestiva.</p>

    <h2>10. Modifiche alla Privacy Policy</h2>
    <p>Ci riserviamo il diritto di aggiornare questa Privacy Policy in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione della nuova Privacy Policy.</p>

    <h2>11. Contatti</h2>
    <p>Per qualsiasi domanda o richiesta relativa a questa Privacy Policy, puoi contattarci all'indirizzo:</p>
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
