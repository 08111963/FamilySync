import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../lib/config';
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from '../../shared/policy-version';
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_INTRO, type PolicyBlock } from '../../shared/privacy-policy-content';

const router = Router();

const LAST_UPDATED = PRIVACY_POLICY_DATE;
// I Termini d'Uso hanno una loro data di revisione, indipendente dalla privacy.
const TERMS_DATE = '30 giugno 2026';
const APP_NAME = "FamilySync";
// TODO PRIVACY: sostituire in futuro FamilySync con l'identità giuridica completa del Titolare del trattamento.
const OWNER = "FamilySync";
const CONTACT_EMAIL = "assistenza@familysync.it";

function getBaseUrl(req: Request): string {
  return config.getBaseUrl(req);
}

function htmlWrapper(title: string, body: string, lastUpdated: string = LAST_UPDATED): string {
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
    <p class="update-date">Ultimo aggiornamento: ${lastUpdated}</p>
  </div>
  <div class="footer">&copy; 2026 ${OWNER}. Tutti i diritti riservati.</div>
</body>
</html>`;
}

function inlineHtml(text: string): string {
  let out = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank">$1</a>');
  out = out.replace(/(^|[\s:(])((?:[a-zA-Z0-9._%+-]+)@(?:[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/g, '$1<a href="mailto:$2">$2</a>');
  out = out.replace(/(^|[\s(])(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1<a href="https://$2" target="_blank">$2</a>');
  return out;
}

function renderPolicyBlocks(blocks: PolicyBlock[]): string {
  const parts: string[] = [];
  let listItems: string[] = [];
  const flush = () => {
    if (listItems.length > 0) {
      parts.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
    }
  };
  for (const block of blocks) {
    if (block.type === 'li') {
      listItems.push(`<li>${inlineHtml(block.text)}</li>`);
    } else {
      flush();
      parts.push(`<p>${inlineHtml(block.text)}</p>`);
    }
  }
  flush();
  return parts.join('\n    ');
}

router.get('/privacy', (_req: Request, res: Response) => {
  // Il contenuto proviene dalla FONTE UNICA condivisa (shared/privacy-policy-content.ts),
  // la stessa usata dalla schermata mobile e dal DOCX di consegna.
  const sectionsHtml = PRIVACY_POLICY_SECTIONS.map(
    (section) => `<h2>${inlineHtml(section.title)}</h2>\n    ${renderPolicyBlocks(section.blocks)}`
  ).join('\n\n    ');

  const body = `
    <p>${inlineHtml(PRIVACY_POLICY_INTRO)}</p>

    ${sectionsHtml}
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper('Privacy Policy', body));
});

router.get('/minori', (_req: Request, res: Response) => {
  const body = `
    <p><strong>Informativa privacy semplificata per ragazze e ragazzi</strong></p>

    <h2>Ciao!</h2>
    <p>Questa pagina spiega in modo semplice come ${APP_NAME} usa le tue informazioni. La versione completa (piu' lunga e dettagliata) e' nella <a href="/legal/privacy">Privacy Policy</a>, che puo' leggerti anche un adulto della tua famiglia.</p>

    <h2>Cosa sappiamo di te</h2>
    <ul>
      <li>Il tuo nome (o soprannome) e la tua email, che servono per farti entrare nell'app</li>
      <li>Le cose che tu e la tua famiglia scrivete nell'app: eventi del calendario, liste della spesa, faccende, messaggi in chat</li>
    </ul>

    <h2>Chi vede le tue cose</h2>
    <p>Quello che scrivi nell'app lo vedono <strong>solo i membri della tua famiglia</strong>. Non lo mostriamo ad altre persone e non lo usiamo per pubblicita'.</p>

    <h2>Se hai meno di 14 anni</h2>
    <ul>
      <li>Non puoi creare un account da solo/a: serve un genitore o un adulto che si occupa di te</li>
      <li>Il tuo profilo viene creato e controllato da un adulto della famiglia</li>
      <li>Le funzioni di intelligenza artificiale (i "suggerimenti automatici") <strong>non sono disponibili</strong> per te</li>
    </ul>

    <h2>Consigli utili</h2>
    <ul>
      <li>Non scrivere in chat o nelle note informazioni molto personali (es. dati sulla salute) se non serve</li>
      <li>Se qualcosa ti sembra strano o ti mette a disagio, parlane subito con un genitore</li>
      <li>Tu e i tuoi genitori potete chiedere di correggere o cancellare le tue informazioni quando volete</li>
    </ul>

    <h2>Domande?</h2>
    <p>Un adulto della tua famiglia puo' scriverci a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper('Privacy per Ragazze e Ragazzi', body));
});

router.get('/terms', (_req: Request, res: Response) => {
  const body = `
    <h2>1. Accettazione dei Termini</h2>
    <p>Utilizzando ${APP_NAME}, accetti di essere vincolato dai presenti Termini d'Uso. Se non accetti questi termini, ti preghiamo di non utilizzare l'applicazione.</p>

    <h2>2. Descrizione del Servizio</h2>
    <p>${APP_NAME} è un'applicazione per il coordinamento familiare che consente ai membri di una famiglia di:</p>
    <ul>
      <li>Gestire un calendario condiviso</li>
      <li>Creare e condividere liste della spesa</li>
      <li>Organizzare e assegnare faccende domestiche con un sistema di punti</li>
      <li>Tenere traccia delle bollette e delle scadenze domestiche, con possibilità di allegare documenti</li>
      <li>Pianificare ricette e menu settimanali</li>
      <li>Comunicare tramite una chat interna con messaggi, immagini e allegati</li>
      <li>Ricevere suggerimenti basati sull'intelligenza artificiale, ove disponibili</li>
      <li>Sincronizzare le informazioni in tempo reale tra i dispositivi</li>
    </ul>

    <h2>3. Account e Registrazione</h2>
    <ul>
      <li>Per utilizzare ${APP_NAME} è necessario creare un account fornendo un indirizzo email valido, un nome e una password</li>
      <li>Sei responsabile della riservatezza delle tue credenziali di accesso</li>
      <li>Le informazioni fornite durante la registrazione devono essere accurate e aggiornate</li>
    </ul>

    <h2>4. Minori</h2>
    <ul>
      <li>Per creare un account occorre avere almeno 14 anni</li>
      <li>I minori di 14 anni possono utilizzare l'app solo sotto la supervisione e con il consenso di un genitore o tutore legale</li>
      <li>${APP_NAME} è pensata per il coordinamento familiare e non è un servizio autonomo destinato principalmente ai bambini</li>
    </ul>

    <h2>5. Gruppi Familiari</h2>
    <ul>
      <li>L'utente che crea un gruppo familiare ne diventa automaticamente l'amministratore</li>
      <li>Gli amministratori possono invitare nuovi membri, rimuovere membri esistenti e gestire le impostazioni del gruppo</li>
      <li>I contenuti inseriti all'interno di un gruppo familiare (eventi, liste, faccende) sono visibili a tutti i membri del gruppo</li>
      <li>L'uscita da un gruppo familiare non comporta la cancellazione dei contenuti precedentemente condivisi</li>
    </ul>

    <h2>6. Responsabilità dei Contenuti (UGC)</h2>
    <p>L'utente è l'unico responsabile dei contenuti inseriti nell'applicazione (contenuti generati dagli utenti, "UGC"), inclusi ma non limitati a:</p>
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
    <p><strong>Licenza limitata sui contenuti:</strong> l'utente mantiene la piena titolarità dei propri contenuti. Caricando contenuti, l'utente concede a ${APP_NAME} una licenza limitata, non esclusiva, gratuita e revocabile, valida per la sola durata dell'utilizzo del servizio e al solo scopo di erogare le funzionalità dell'app (ad esempio archiviazione, sincronizzazione tra dispositivi e condivisione con gli altri membri della famiglia). Questa licenza non attribuisce a ${APP_NAME} alcun diritto di utilizzare i contenuti per finalità diverse e cessa al momento della rimozione dei contenuti o dell'eliminazione dell'account, salvo i contenuti già condivisi con altri membri o gli obblighi di conservazione previsti dalla legge.</p>

    <h2>7. Chat e Allegati</h2>
    <p>L'app include una chat interna che consente ai membri della stessa famiglia di scambiarsi messaggi di testo, immagini e file allegati.</p>
    <ul>
      <li>I messaggi e gli allegati sono visibili a tutti i membri del gruppo familiare</li>
      <li>L'utente è responsabile dei contenuti che invia e non deve caricare materiale illegale, offensivo o in violazione di diritti altrui</li>
      <li>Sono ammessi solo i tipi di file consentiti dall'app, in particolare immagini e PDF, entro i limiti di dimensione previsti</li>
      <li>I messaggi degli utenti bloccati non vengono mostrati al membro che ha effettuato il blocco</li>
      <li>I file allegati vengono conservati sui nostri server per consentire la visualizzazione. Se l'utente è l'unico membro di una famiglia e la famiglia viene eliminata, vengono rimossi anche gli allegati fisici collegati, come immagini della chat, documenti delle bollette e avatar. Se invece la famiglia continua a esistere con altri membri, i contenuti e gli allegati già condivisi possono restare disponibili agli altri membri in forma associata a "Utente eliminato"</li>
    </ul>

    <h2>8. Gestione Bollette e Scadenze</h2>
    <p>${APP_NAME} offre uno strumento per annotare bollette, importi e scadenze domestiche e per allegare documenti relativi.</p>
    <ul>
      <li><strong>${APP_NAME} NON elabora pagamenti reali:</strong> la funzione bollette ha finalità esclusivamente organizzativa e di promemoria. L'app non esegue, non gestisce e non intermedia alcun pagamento verso fornitori o terzi</li>
      <li>L'app <strong>non richiede e non deve essere utilizzata per inserire dati di pagamento sensibili</strong> come numeri di carta di credito, codici CVV, coordinate bancarie complete o IBAN. Si invita l'utente a non inserire tali dati nei campi di testo o negli allegati</li>
      <li>Gli importi e le scadenze inseriti sono semplici annotazioni a cura dell'utente: ${APP_NAME} non ne garantisce l'esattezza e non è responsabile di mancati pagamenti, more o penali</li>
      <li>L'utente resta l'unico responsabile del pagamento effettivo delle proprie bollette presso i rispettivi fornitori</li>
      <li>I promemoria e le notifiche hanno funzione di supporto e potrebbero non essere sempre ricevuti, ad esempio per impostazioni del dispositivo, assenza di rete, limitazioni del sistema operativo o disattivazione delle notifiche</li>
    </ul>

    <h2>9. Funzionalità di Intelligenza Artificiale</h2>
    <p>${APP_NAME} offre funzionalità basate sull'intelligenza artificiale (ad esempio suggerimenti per la spesa, ottimizzazione delle faccende e proposte di ricette o piani pasti).</p>
    <ul>
      <li>Le funzionalità AI sono <strong>disponibili secondo le impostazioni dell'app</strong>, con un interruttore dedicato per attivarle o disattivarle in qualsiasi momento, e nei limiti previsti dal piano Free o Premium</li>
      <li>Per fornire i suggerimenti, alcuni dati pertinenti possono essere inviati a fornitori terzi di servizi AI; non vengono inviati più dati del necessario</li>
      <li>I contenuti generati dall'AI hanno <strong>natura puramente indicativa e possono essere imprecisi, incompleti o non aggiornati</strong>. Non costituiscono consulenza medica, nutrizionale, legale o finanziaria</li>
      <li>L'utente è tenuto a verificare in autonomia i suggerimenti prima di utilizzarli: ${APP_NAME} non è responsabile delle decisioni assunte sulla base dei contenuti generati dall'AI</li>
      <li>L'uso dell'AI può essere soggetto a limiti di utilizzo (quota) differenziati tra piano Free e Premium</li>
    </ul>

    <h2>10. Segnalazione e Moderazione Contenuti</h2>
    <p>Per garantire un ambiente sicuro e rispettoso per tutte le famiglie, ${APP_NAME} offre strumenti di segnalazione e moderazione:</p>
    <ul>
      <li><strong>Segnalazione contenuti:</strong> ogni membro della famiglia può segnalare contenuti (eventi, articoli spesa, faccende, messaggi chat) o utenti che ritiene inappropriati, offensivi o in violazione dei Termini</li>
      <li><strong>Categorie di segnalazione:</strong> spam, molestie, odio, contenuti sessuali, violenza, altro</li>
      <li><strong>Gestione segnalazioni:</strong> le segnalazioni vengono esaminate dagli amministratori del gruppo familiare, che possono prendere provvedimenti (azione o archiviazione)</li>
      <li><strong>Blocco utenti:</strong> ogni membro può bloccare un altro membro all'interno della propria famiglia. I contenuti degli utenti bloccati non saranno più visibili al membro che ha effettuato il blocco</li>
      <li><strong>Sblocco:</strong> è possibile sbloccare un utente in qualsiasi momento dalle impostazioni</li>
      <li>Per segnalazioni che richiedono assistenza puoi scrivere a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></li>
    </ul>
    <p>L'abuso del sistema di segnalazione (segnalazioni false o ripetute in malafede) può comportare la sospensione dell'account.</p>

    <h2>11. Uso Corretto</h2>
    <p>L'utente si impegna a:</p>
    <ul>
      <li>Utilizzare l'applicazione esclusivamente per le finalità previste di coordinamento familiare</li>
      <li>Non tentare di accedere ad account o dati di altri utenti senza autorizzazione</li>
      <li>Non utilizzare sistemi automatizzati (bot, scraper) per interagire con il servizio</li>
      <li>Non tentare di compromettere la sicurezza o la stabilità dell'applicazione</li>
      <li>Rispettare le leggi applicabili durante l'utilizzo del servizio</li>
    </ul>

    <h2>12. Divieti</h2>
    <p>È espressamente vietato:</p>
    <ul>
      <li>Creare account falsi o multipli per finalità abusive</li>
      <li>Utilizzare il servizio per attività commerciali non autorizzate</li>
      <li>Distribuire malware o contenuti dannosi attraverso l'applicazione</li>
      <li>Tentare di effettuare ingegneria inversa del software</li>
      <li>Interferire con il funzionamento dell'applicazione o dei suoi server</li>
    </ul>

    <h2>13. Piani Free e Premium e Abbonamenti</h2>
    <p>${APP_NAME} è disponibile in un piano <strong>Free</strong> gratuito e in un piano <strong>Premium</strong> a pagamento, attivabile tramite abbonamento.</p>
    <ul>
      <li><strong>Piano Free:</strong> consente l'utilizzo delle funzionalità di base, con alcuni limiti (ad esempio quota di utilizzo delle funzionalità AI)</li>
      <li><strong>Piano Premium:</strong> sblocca funzionalità aggiuntive e limiti più ampi. Prezzi e durata dell'abbonamento sono indicati all'interno dell'app al momento dell'acquisto</li>
      <li><strong>Acquisti su mobile:</strong> gli abbonamenti Premium sulle app mobili vengono gestiti tramite i sistemi di pagamento degli store ufficiali, ovvero <strong>Apple App Store (StoreKit)</strong> su iOS e <strong>Google Play Billing</strong> su Android, con il supporto tecnico del fornitore <strong>RevenueCat</strong> per la gestione degli abbonamenti</li>
      <li>L'addebito, il rinnovo automatico e la gestione o cancellazione dell'abbonamento avvengono tramite l'account dello store (Apple o Google). Per disdire occorre agire nelle impostazioni del proprio account store; la disinstallazione dell'app non annulla l'abbonamento</li>
      <li>I rimborsi sono soggetti alle politiche dello store di riferimento (Apple o Google)</li>
      <li>Alcune funzionalità Premium possono essere disponibili solo dopo l'attivazione del servizio di abbonamento</li>
    </ul>

    <h2>14. Sospensione e Chiusura Account</h2>
    <p>Ci riserviamo il diritto di:</p>
    <ul>
      <li>Sospendere temporaneamente o chiudere definitivamente un account in caso di violazione dei presenti Termini</li>
      <li>Rimuovere contenuti che violino le nostre politiche o le leggi applicabili</li>
      <li>Interrompere il servizio con un preavviso ragionevole</li>
    </ul>
    <p>L'utente può eliminare il proprio account in qualsiasi momento direttamente dall'app (scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>), anche se l'indirizzo email non è ancora stato verificato, oppure contattandoci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. L'eliminazione è definitiva: comporta l'anonimizzazione del profilo e, se l'utente è l'unico membro di una famiglia, la cancellazione della famiglia e dei relativi contenuti, inclusi i file fisici allegati (immagini della chat, documenti delle bollette e avatar). I contenuti già condivisi con una famiglia che continua a esistere con altri membri possono restare visibili in forma anonima. L'eliminazione dell'account non annulla eventuali abbonamenti Premium, che vanno gestiti separatamente dallo store (Apple o Google).</p>

    <h2>15. Limitazioni di Responsabilità</h2>
    <p>Nei limiti consentiti dalla legge applicabile:</p>
    <ul>
      <li>Il servizio viene fornito "così com'è" e "come disponibile", senza garanzie di alcun tipo, espresse o implicite</li>
      <li>Non garantiamo che il servizio sia sempre disponibile, privo di errori o sicuro al 100%</li>
      <li>Non siamo responsabili per eventuali perdite di dati dovute a malfunzionamenti tecnici, salvo dolo o colpa grave</li>
      <li>La nostra responsabilità massima è limitata all'importo pagato dall'utente per il servizio nei 12 mesi precedenti l'evento</li>
    </ul>
    <p>Nessuna disposizione dei presenti Termini esclude o limita la responsabilità nei casi in cui ciò non sia consentito dalla legge, inclusi i diritti inderogabili riconosciuti ai consumatori.</p>

    <h2>16. Proprietà Intellettuale</h2>
    <p>Tutti i diritti di proprietà intellettuale relativi a ${APP_NAME}, inclusi design, codice, marchi e contenuti originali, sono di proprietà esclusiva di FamilySync. L'utente non acquisisce alcun diritto di proprietà intellettuale sull'applicazione. Restano salvi i diritti dell'utente sui propri contenuti (UGC) e la licenza limitata descritta alla sezione 6.</p>

    <h2>17. Legge Applicabile e Foro Competente</h2>
    <p>I presenti Termini d'Uso sono regolati dalla legge italiana. Per qualsiasi controversia derivante dall'utilizzo del servizio, sarà competente il Foro del luogo di residenza del consumatore, in conformità con il Codice del Consumo italiano.</p>

    <h2>18. Modifiche ai Termini</h2>
    <p>Ci riserviamo il diritto di modificare i presenti Termini d'Uso in qualsiasi momento. Le modifiche saranno comunicate tramite l'applicazione e/o via email. L'uso continuato del servizio dopo la pubblicazione delle modifiche costituisce accettazione dei nuovi Termini.</p>

    <h2>19. Contatti</h2>
    <p>Per qualsiasi domanda o segnalazione relativa ai presenti Termini d'Uso:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper("Termini d'Uso", body, TERMS_DATE));
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
      <li>Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge, contabili o di sicurezza; i log di sistema sono conservati per il tempo strettamente necessario a finalità di sicurezza e diagnostica, secondo le impostazioni tecniche dei fornitori di hosting</li>
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
