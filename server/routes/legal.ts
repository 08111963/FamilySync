import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../lib/config';
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_DATE } from '../../shared/policy-version';

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

router.get('/privacy', (_req: Request, res: Response) => {
  const body = `
    <p><strong>Versione ${PRIVACY_POLICY_VERSION} — ${LAST_UPDATED}</strong></p>

    <h2>1. Titolare del Trattamento</h2>
    <p>Il titolare del trattamento dei dati personali è <strong>FamilySync</strong>.</p>
    <p>Per qualsiasi domanda o richiesta relativa alla privacy, all'esercizio dei tuoi diritti o al supporto, puoi contattarci all'unico indirizzo email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    <p>Sito di riferimento: <a href="https://familysync.eu" target="_blank">https://familysync.eu</a></p>

    <h2>2. Dati Raccolti</h2>
    <p>${APP_NAME} raccoglie e tratta le seguenti categorie di dati personali, in base alle funzioni che utilizzi:</p>
    <ul>
      <li><strong>Dati di account:</strong> nome, indirizzo email e password. La password non viene mai conservata in chiaro: viene salvata solo una sua rappresentazione irreversibile ottenuta con un algoritmo di hashing robusto, secondo le buone pratiche di settore</li>
      <li><strong>Fascia di età (facoltativa):</strong> in fase di registrazione puoi indicare una fascia di età (14-17 anni oppure 18 anni o più). Non raccogliamo la data di nascita. Questa informazione serve solo ad applicare le tutele previste per i minori</li>
      <li><strong>Verifica e sicurezza account:</strong> token di verifica email (a scadenza temporale) e token di reset password (conservati in forma hashata), stato di verifica</li>
      <li><strong>Registro dei consensi:</strong> data, tipo di consenso (es. Termini, funzioni AI), stato (prestato/revocato) e versione della policy in vigore al momento</li>
      <li><strong>Dati familiari:</strong> nomi dei membri, ruoli nel gruppo, inviti familiari e relativi token di invito (conservati in forma hashata)</li>
      <li><strong>Eventi calendario:</strong> titoli, date, orari, luoghi e descrizioni degli eventi condivisi</li>
      <li><strong>Liste della spesa e dispensa:</strong> nomi delle liste, articoli inseriti e relativo storico</li>
      <li><strong>Faccende domestiche:</strong> attività assegnate, stato di completamento, punti accumulati</li>
      <li><strong>Ricette e piani pasti:</strong> ricette, ingredienti e pianificazioni settimanali</li>
      <li><strong>Chat e messaggi:</strong> contenuti dei messaggi scambiati tra i membri della famiglia ed eventuali file/immagini allegati</li>
      <li><strong>Allegati caricati dagli utenti:</strong> immagini e documenti caricati nell'app (ad esempio nelle chat o associati alle bollette)</li>
      <li><strong>Bollette, scadenze e budget:</strong> titoli, categorie, importi, date di scadenza, fornitori, intestatari, responsabili, note, ricevute, allegati e spese registrate manualmente</li>
      <li><strong>Ripartizioni e pagamenti:</strong> suddivisione degli importi tra i membri e storico dei pagamenti registrati manualmente</li>
      <li><strong>Registrazioni vocali (facoltative):</strong> se usi la dettatura vocale, l'audio viene inviato al fornitore AI per la sola trascrizione e non viene conservato sui nostri server</li>
      <li><strong>Notifiche:</strong> preferenze di notifica e, se attive le notifiche push, il token push del dispositivo</li>
      <li><strong>Dati tecnici:</strong> informazioni sul dispositivo, log di accesso e di sistema, indirizzo IP (se raccolto dai log), token di sessione</li>
    </ul>

    <h2>3. Dati Inseriti da Altri Membri della Famiglia</h2>
    <p>${APP_NAME} è un'app condivisa: alcune informazioni che ti riguardano possono essere inserite da altri membri della tua famiglia (ad esempio il tuo soprannome, eventi che ti coinvolgono, faccende assegnate a te, ripartizioni di spesa o messaggi che ti citano).</p>
    <p>Chi inserisce dati relativi ad altre persone è responsabile di farlo in modo corretto e rispettoso. Se ritieni che un dato che ti riguarda sia inesatto o non debba essere presente, puoi modificarlo (dove previsto), chiedere al membro che lo ha inserito di correggerlo, oppure scriverci a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

    <h2>4. Finalità e Basi Giuridiche del Trattamento</h2>
    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
      <tr style="background:#f0f0f5;"><th style="text-align:left; padding:8px; border:1px solid #ddd;">Finalità</th><th style="text-align:left; padding:8px; border:1px solid #ddd;">Base giuridica (art. 6 GDPR)</th></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Erogazione del servizio (calendario, liste, faccende, chat, bollette, budget, ricette, sincronizzazione)</td><td style="padding:8px; border:1px solid #ddd;">Esecuzione del contratto (art. 6.1.b)</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Comunicazioni di servizio (verifica email, reset password, inviti)</td><td style="padding:8px; border:1px solid #ddd;">Esecuzione del contratto (art. 6.1.b)</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Funzionalità di intelligenza artificiale</td><td style="padding:8px; border:1px solid #ddd;">Consenso esplicito (art. 6.1.a), revocabile in qualsiasi momento</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Sicurezza, prevenzione abusi, rate limiting, log tecnici</td><td style="padding:8px; border:1px solid #ddd;">Legittimo interesse (art. 6.1.f) alla sicurezza del servizio</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Analytics interna temporanea di test (eventi tecnici minimi)</td><td style="padding:8px; border:1px solid #ddd;">Legittimo interesse (art. 6.1.f) al miglioramento e alla stabilità del servizio</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Adempimento di obblighi di legge</td><td style="padding:8px; border:1px solid #ddd;">Obbligo legale (art. 6.1.c)</td></tr>
    </table>

    <h2>5. Bollette e Scadenze</h2>
    <p>${APP_NAME} consente di registrare bollette e scadenze domestiche, inclusi importi, date di scadenza, fornitori, intestatari, note, allegati e ricevute, oltre alla ripartizione delle spese tra i membri della famiglia e allo storico dei pagamenti.</p>
    <p><strong>Importante:</strong> l'app NON effettua pagamenti reali, NON elabora transazioni verso terzi, NON salva carte di credito, NON salva codici CVV e NON salva coordinate bancarie (IBAN). Lo stato "pagato" e i relativi importi sono registrazioni inserite manualmente dagli utenti a scopo organizzativo.</p>

    <h2>6. Email Transazionali</h2>
    <p>${APP_NAME} invia email transazionali tramite il fornitore <strong>Resend</strong> per: verifica dell'account, inviti familiari, reset della password e comunicazioni essenziali relative al servizio.</p>
    <p>Le email <strong>non contengono mai la password</strong> dell'utente. I link di verifica e reset hanno una durata limitata nel tempo (vedi sezione Conservazione dei Dati).</p>

    <h2>7. Funzionalità di Intelligenza Artificiale (AI)</h2>
    <p>${APP_NAME} offre funzionalità facoltative basate sull'intelligenza artificiale tramite il fornitore <strong>OpenAI</strong>. Le funzioni AI sono <strong>disattivate finché non le attivi tu</strong>: il consenso non è mai preselezionato, viene richiesto in fase di registrazione oppure può essere prestato in seguito dalle impostazioni, ed è revocabile in qualsiasi momento (Famiglia &rarr; Centro Privacy).</p>
    <p>Le funzioni AI disponibili e i dati inviati al fornitore per ciascuna sono:</p>
    <ul>
      <li><strong>Suggerimenti spesa:</strong> numero di membri (senza nomi), articoli recenti delle liste, contenuto della dispensa, titoli degli eventi in programma, stagione corrente</li>
      <li><strong>Ottimizzazione faccende:</strong> soprannomi dei membri, punti accumulati, titoli e durata stimata delle faccende</li>
      <li><strong>Insights familiari e consigli di risparmio:</strong> conteggi aggregati (eventi, faccende, spese per categoria), soprannome del miglior contributore, punti settimanali</li>
      <li><strong>Ricette e piani pasti:</strong> preferenze indicate, ingredienti disponibili in dispensa, titoli delle ricette</li>
      <li><strong>Compilazione assistita (eventi, faccende, bollette, spese):</strong> il testo libero che detti o scrivi per farti aiutare a compilare i campi</li>
      <li><strong>Trascrizione vocale:</strong> la registrazione audio della tua voce, inviata al solo scopo di trascriverla in testo; l'audio non viene conservato sui nostri server</li>
      <li><strong>Foto ricette AI:</strong> il titolo della ricetta, usato per generare un'immagine illustrativa del piatto</li>
    </ul>
    <p><strong>Dati NON inviati al fornitore AI:</strong> password, indirizzi email, dati di pagamento, allegati e ricevute, contenuti della chat, indirizzi fisici o numeri di telefono.</p>
    <p><strong>Attenzione ai campi di testo libero:</strong> quando usi la dettatura o la compilazione assistita, il testo che scrivi o detti viene inviato al fornitore AI così com'è. Ti invitiamo a non inserire in questi campi dati sensibili (es. informazioni sulla salute) o dati di terze persone non necessari.</p>
    <p>In base ai termini contrattuali del fornitore applicabili all'uso via API, i dati inviati non vengono utilizzati per l'addestramento dei modelli. Il trattamento è regolato anche dalla <a href="https://openai.com/policies/privacy-policy" target="_blank">Privacy Policy di OpenAI</a>.</p>
    <p>I contenuti generati dall'AI sono chiaramente presentati come tali nell'app. Hanno natura indicativa, possono contenere errori e non costituiscono consulenza professionale. ${APP_NAME} <strong>non adotta decisioni basate unicamente su trattamenti automatizzati</strong> che producano effetti giuridici o significativi sugli utenti.</p>
    <p><strong>Base giuridica:</strong> consenso esplicito dell'utente (art. 6.1.a GDPR), revocabile in qualsiasi momento senza pregiudicare la liceità del trattamento precedente.</p>

    <h2>8. Minori</h2>
    <p>${APP_NAME} è un'app per il coordinamento familiare, pensata per essere usata dalla famiglia insieme.</p>
    <ul>
      <li>Per creare un account in autonomia occorre avere <strong>almeno 14 anni</strong> (età del consenso digitale in Italia, art. 2-quinquies D.Lgs. 196/2003). La registrazione autonoma di minori di 14 anni non è consentita e viene bloccata</li>
      <li>I minori di 14 anni possono usare l'app solo tramite profili creati e supervisionati da un genitore o tutore che è membro della famiglia</li>
      <li>Per i profili di età inferiore ai 14 anni le <strong>funzioni AI non sono disponibili</strong>: il blocco è applicato dai nostri server e non dipende dalle impostazioni del dispositivo</li>
      <li>In fase di registrazione chiediamo solo una fascia di età, non la data di nascita, in linea con il principio di minimizzazione</li>
      <li>Se veniamo a conoscenza di aver raccolto dati di un minore di 14 anni senza il coinvolgimento di un genitore o tutore, provvederemo alla loro cancellazione tempestiva</li>
    </ul>
    <p>Una <a href="${getBaseUrl(_req)}/legal/minori">informativa semplificata per ragazze e ragazzi</a> è disponibile con un linguaggio adatto ai più giovani.</p>

    <h2>9. Categorie Particolari di Dati (Dati Sensibili)</h2>
    <p>${APP_NAME} non richiede e non è progettata per raccogliere categorie particolari di dati personali (art. 9 GDPR), come dati sulla salute, convinzioni religiose od opinioni politiche.</p>
    <p>Tuttavia, i campi di testo libero (eventi, note, chat, faccende, liste) potrebbero contenere informazioni di questo tipo se scelte e inserite dagli utenti (ad esempio "visita cardiologica" nel calendario). Questi contenuti restano visibili solo alla famiglia, non vengono usati per altre finalità e ti invitiamo a inserirli solo se necessario. Ricorda che, se attivi le funzioni AI, alcuni titoli o testi liberi possono essere inviati al fornitore AI (vedi sezione 7).</p>

    <h2>10. Analytics Interna Temporanea (Periodo di Test)</h2>
    <p>Durante il periodo di test dell'app può essere attiva una raccolta <strong>interna e temporanea</strong> di eventi tecnici minimi (es. apertura dell'app, schermata visitata, errori tecnici), utile a verificare stabilità e funzionamento.</p>
    <ul>
      <li>Non vengono registrati contenuti personali (niente messaggi, titoli, importi o dati delle liste)</li>
      <li>I metadati sono filtrati da una lista ristretta di campi tecnici ammessi</li>
      <li>Gli eventi sono conservati al massimo <strong>30 giorni</strong> e poi cancellati automaticamente</li>
      <li>L'accesso è riservato al solo titolare dell'app; nessun dato è condiviso con terze parti</li>
      <li>Non vengono utilizzati SDK di analytics di terze parti né strumenti di tracciamento pubblicitario</li>
    </ul>
    <p><strong>Base giuridica:</strong> legittimo interesse (art. 6.1.f GDPR) al miglioramento e alla stabilità del servizio. Puoi opporti scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

    <h2>11. Pagamenti e Abbonamenti Premium</h2>
    <p>Gli eventuali abbonamenti Premium nell'app mobile sono gestiti tramite gli acquisti in-app degli store, con la gestione degli abbonamenti e dei diritti (entitlements) affidata a <strong>RevenueCat</strong>:</p>
    <ul>
      <li><strong>Apple In-App Purchase / StoreKit</strong> su iOS;</li>
      <li><strong>Google Play Billing</strong> su Android;</li>
      <li><strong>RevenueCat</strong> per la gestione di abbonamenti, stato dell'abbonamento ed entitlements.</li>
    </ul>
    <p>I dati di pagamento (carte, ecc.) sono trattati direttamente da Apple o Google secondo le rispettive policy; ${APP_NAME} non ha accesso ai dati completi della tua carta.</p>

    <h2>12. Notifiche</h2>
    <ul>
      <li><strong>Notifiche locali:</strong> programmate direttamente sul dispositivo (ad esempio i promemoria per le scadenze delle bollette); non richiedono l'invio dei contenuti a server esterni.</li>
      <li><strong>Notifiche push remote:</strong> se attivate, possono utilizzare un token push del dispositivo e i servizi di notifica di Expo/Apple/Google per recapitare gli avvisi.</li>
      <li><strong>Notifiche push web:</strong> se attivate dal browser, utilizzano il servizio push del browser stesso (Google, Apple, Mozilla o Microsoft) tramite una sottoscrizione revocabile in qualsiasi momento dalle impostazioni del browser.</li>
    </ul>

    <h2>13. Fornitori e Condivisione con Terze Parti</h2>
    <p>Per erogare il servizio ci avvaliamo dei seguenti fornitori, ciascuno per le sole finalità indicate:</p>
    <ul>
      <li><strong>Replit, Inc.:</strong> hosting e deploy dell'applicazione e del backend (responsabile del trattamento)</li>
      <li><strong>Neon, Inc. (PostgreSQL):</strong> database in cui sono archiviati i dati (responsabile del trattamento)</li>
      <li><strong>Resend (Plus Five Five, Inc.):</strong> invio di email transazionali (responsabile del trattamento)</li>
      <li><strong>OpenAI, L.L.C.:</strong> funzioni AI e trascrizione vocale, solo dati minimizzati e solo con il tuo consenso (responsabile del trattamento)</li>
      <li><strong>RevenueCat, Inc.:</strong> gestione di abbonamenti e acquisti in-app (responsabile del trattamento)</li>
      <li><strong>Apple e Google:</strong> acquisti in-app, login social ("Accedi con Google" / "Sign in with Apple") e servizi di notifica; per queste attività operano in base alle proprie policy, in genere come titolari autonomi del trattamento</li>
      <li><strong>Servizi di notifica push</strong> (Expo e, per il web, i servizi push del browser di Google/Apple/Mozilla/Microsoft): recapito delle notifiche push, se attive</li>
    </ul>
    <p>Quando un fornitore tratta dati personali per conto di FamilySync, il rapporto è disciplinato, ove richiesto, da un accordo ai sensi dell'articolo 28 GDPR. Alcuni soggetti, come gli store o i provider di identità, possono trattare determinati dati anche come titolari autonomi secondo le rispettive informative.</p>
    <p>Non vendiamo, affittiamo o condividiamo i tuoi dati personali con terze parti per finalità di marketing.</p>

    <h2>14. Trasferimenti Extra-SEE</h2>
    <p>Alcuni fornitori (ad esempio OpenAI, Resend, RevenueCat, Apple, Google o Replit) hanno sede negli Stati Uniti o possono trattare i dati su infrastrutture situate al di fuori dello Spazio Economico Europeo (SEE).</p>
    <p>In questi casi i trasferimenti si basano sulle garanzie previste dal GDPR, secondo quanto dichiarato da ciascun fornitore nei propri termini: in particolare le <strong>Clausole Contrattuali Standard (SCC)</strong> della Commissione Europea e, per i fornitori aderenti, il <strong>Data Privacy Framework UE-USA</strong>. Puoi chiederci maggiori informazioni sui trasferimenti scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

    <h2>15. Conservazione dei Dati</h2>
    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
      <tr style="background:#f0f0f5;"><th style="text-align:left; padding:8px; border:1px solid #ddd;">Dato</th><th style="text-align:left; padding:8px; border:1px solid #ddd;">Conservazione</th></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Dati dell'account</td><td style="padding:8px; border:1px solid #ddd;">Fino alla cancellazione dell'account</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Dati familiari (calendario, liste, faccende, chat, bollette, budget, ricette, allegati)</td><td style="padding:8px; border:1px solid #ddd;">Fino alla cancellazione della famiglia o dell'account</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Token di reset password</td><td style="padding:8px; border:1px solid #ddd;">1 ora</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Token di verifica email</td><td style="padding:8px; border:1px solid #ddd;">6 ore</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Token di invito familiare</td><td style="padding:8px; border:1px solid #ddd;">72 ore</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Sessioni / refresh token</td><td style="padding:8px; border:1px solid #ddd;">7 giorni</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Eventi di analytics interna di test</td><td style="padding:8px; border:1px solid #ddd;">Massimo 30 giorni</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Registro dei consensi</td><td style="padding:8px; border:1px solid #ddd;">Per la durata dell'account e per il tempo necessario a dimostrare l'adempimento degli obblighi di legge</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Log di sistema</td><td style="padding:8px; border:1px solid #ddd;">Il tempo necessario, fino a un massimo di 12 mesi</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd;">Registrazioni vocali per la trascrizione</td><td style="padding:8px; border:1px solid #ddd;">Non conservate sui nostri server</td></tr>
    </table>
    <p>I dati possono inoltre risiedere temporaneamente nei backup dell'infrastruttura del fornitore di database, gestiti secondo i cicli tecnici di quest'ultimo, e vengono rimossi con la naturale rotazione dei backup.</p>

    <h2>16. Cancellazione dell'Account</h2>
    <p>Puoi eliminare il tuo account in autonomia e in qualsiasi momento direttamente dall'app, nella scheda <strong>Famiglia</strong> &rarr; <strong>Elimina account</strong>, confermando con la tua password. In alternativa puoi richiedere la cancellazione scrivendo a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    <p>Cosa succede in concreto:</p>
    <ul>
      <li>Il tuo profilo personale viene <strong>reso anonimo</strong>: nome ed email vengono rimossi e sostituiti, la password e i token di accesso vengono eliminati e non è più possibile accedere all'account</li>
      <li>Se sei l'<strong>unico membro</strong> di una famiglia, quella famiglia e tutti i suoi dati (calendario, liste, faccende, chat, allegati, bollette e ricevute) vengono <strong>eliminati definitivamente</strong>, inclusi i file fisici allegati</li>
      <li>Se la famiglia ha <strong>altri membri</strong>, i contenuti che hai condiviso restano visibili agli altri in forma anonima (autore mostrato come "Utente eliminato"): questo tutela la continuità dei dati condivisi della famiglia</li>
    </ul>
    <p>L'eliminazione è definitiva e irreversibile. Alcuni dati possono essere conservati per il tempo necessario ad adempiere a obblighi di legge. L'eliminazione dell'account non annulla automaticamente eventuali abbonamenti Premium, che vanno gestiti dallo store (Apple o Google). Maggiori dettagli sono disponibili alla pagina dedicata all'<a href="${getBaseUrl(_req)}/legal/delete-account">eliminazione dell'account</a>.</p>

    <h2>17. Diritti dell'Utente</h2>
    <p>In conformità con il GDPR (artt. 15-22), hai il diritto di:</p>
    <ul>
      <li><strong>Accesso:</strong> richiedere una copia dei tuoi dati personali</li>
      <li><strong>Rettifica:</strong> correggere dati inesatti o incompleti</li>
      <li><strong>Cancellazione:</strong> richiedere la cancellazione dei tuoi dati</li>
      <li><strong>Portabilità:</strong> ricevere i tuoi dati in un formato strutturato, di uso comune e leggibile da dispositivo automatico</li>
      <li><strong>Opposizione:</strong> opporti ai trattamenti basati sul legittimo interesse (ad esempio l'analytics interna di test), per motivi connessi alla tua situazione particolare</li>
      <li><strong>Limitazione:</strong> chiedere la limitazione del trattamento dei tuoi dati</li>
      <li><strong>Revoca del consenso:</strong> revocare in qualsiasi momento i consensi prestati (ad esempio per le funzioni AI, dal Centro Privacy nell'app), senza pregiudicare la liceità del trattamento precedente</li>
      <li><strong>Reclamo:</strong> proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank">www.garanteprivacy.it</a>)</li>
    </ul>
    <p>Per esercitare questi diritti scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Per proteggerti, prima di dare seguito a una richiesta potremmo doverti chiedere elementi per verificare la tua identità. Rispondiamo entro un mese dalla richiesta, prorogabile di due mesi nei casi complessi previsti dal GDPR. L'esportazione dei dati viene fornita tramite il canale email di assistenza.</p>

    <h2>18. Violazioni dei Dati (Data Breach)</h2>
    <p>In caso di violazione dei dati personali che presenti un rischio per i diritti e le libertà degli utenti, notificheremo la violazione al Garante per la protezione dei dati personali <strong>entro 72 ore</strong> dal momento in cui ne veniamo a conoscenza, come previsto dall'art. 33 GDPR.</p>
    <p>Se la violazione presenta un rischio elevato per te, te ne daremo comunicazione senza ingiustificato ritardo (art. 34 GDPR), indicando la natura della violazione e le misure adottate.</p>

    <h2>19. Cookie e Archiviazione Locale</h2>
    <p>${APP_NAME} <strong>non utilizza cookie di profilazione né strumenti di tracciamento pubblicitario</strong>, né su mobile né su web.</p>
    <ul>
      <li><strong>App mobile:</strong> i dati di sessione (token di accesso) e alcune preferenze sono salvati nella memoria locale del dispositivo per mantenerti collegato e far funzionare la modalità offline</li>
      <li><strong>Versione web:</strong> il browser salva i dati di sessione e le preferenze nella memoria locale (localStorage), una tecnologia strettamente necessaria al funzionamento del servizio; non vengono usati cookie di terze parti</li>
      <li>Eliminando i dati del sito dal browser o disinstallando l'app, questi dati locali vengono rimossi</li>
    </ul>

    <h2>20. Sicurezza</h2>
    <ul>
      <li>Password conservate esclusivamente in forma hashata con algoritmi robusti e mai in chiaro</li>
      <li>Comunicazioni protette tramite protocollo HTTPS/TLS</li>
      <li>Autenticazione basata su token a scadenza temporale</li>
      <li>Token sensibili (verifica, reset, inviti) conservati solo in forma hashata</li>
      <li>Rate limiting e protezioni contro gli abusi delle API</li>
      <li>Header di sicurezza HTTP e controlli di accesso per famiglia</li>
    </ul>

    <h2>21. Modifiche alla Privacy Policy</h2>
    <p>Questa è la versione ${PRIVACY_POLICY_VERSION} della Privacy Policy. Potremo aggiornarla in futuro: in caso di modifiche rilevanti lo comunicheremo tramite l'applicazione e/o via email, indicando la nuova versione e la data. Ti invitiamo a consultare periodicamente questa pagina.</p>

    <h2>22. Contatti</h2>
    <p>Per qualsiasi domanda o richiesta relativa a questa Privacy Policy, puoi contattarci all'unico indirizzo:</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
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
    <p>Tutti i diritti di proprietà intellettuale relativi a ${APP_NAME}, inclusi design, codice, marchi e contenuti originali, sono di proprietà esclusiva di Marino Pizzuti / FamilySync. L'utente non acquisisce alcun diritto di proprietà intellettuale sull'applicazione. Restano salvi i diritti dell'utente sui propri contenuti (UGC) e la licenza limitata descritta alla sezione 6.</p>

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
