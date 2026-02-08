import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

const LAST_UPDATED = "8 febbraio 2026";
const APP_NAME = "FamilySync";
const DEVELOPER = "FamilySync Team";
const CONTACT_EMAIL = "support@familysync.app";

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
      background: linear-gradient(135deg, #4A90D9, #67B8F0);
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
    .toc {
      background: #fff;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .toc h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #1a1a2e;
    }
    .toc ol {
      padding-left: 20px;
      margin: 0;
    }
    .toc li {
      margin-bottom: 6px;
    }
    .toc a {
      color: #4A90D9;
      text-decoration: none;
      font-size: 15px;
    }
    .toc a:hover {
      text-decoration: underline;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 32px 0 12px;
      color: #1a1a2e;
      padding-bottom: 8px;
      border-bottom: 2px solid #4A90D9;
    }
    h3 {
      font-size: 17px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: #333;
    }
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
    a { color: #4A90D9; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #1a1a2e; }
    .tip {
      background: #E8F4FD;
      border-left: 4px solid #4A90D9;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
      font-size: 14px;
    }
    .tip strong { color: #4A90D9; }
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
    @media (max-width: 480px) {
      .header { padding: 40px 16px 24px; }
      .content { padding: 24px 16px 48px; }
      h2 { font-size: 18px; }
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

router.get('/user-guide', (_req: Request, res: Response) => {
  const body = `
    <div class="toc">
      <h2>Indice</h2>
      <ol>
        <li><a href="#primi-passi">Primi Passi</a></li>
        <li><a href="#home">Home</a></li>
        <li><a href="#calendario">Calendario Condiviso</a></li>
        <li><a href="#spesa">Liste della Spesa</a></li>
        <li><a href="#faccende">Faccende Domestiche</a></li>
        <li><a href="#famiglia">Gestione Famiglia</a></li>
        <li><a href="#ai">Suggerimenti AI</a></li>
        <li><a href="#moderazione">Sicurezza e Moderazione</a></li>
        <li><a href="#impostazioni">Impostazioni e Account</a></li>
        <li><a href="#sync">Sincronizzazione in Tempo Reale</a></li>
        <li><a href="#faq">Domande Frequenti</a></li>
      </ol>
    </div>

    <h2 id="primi-passi">1. Primi Passi</h2>

    <h3>Creare un Account</h3>
    <p>Per iniziare ad usare ${APP_NAME}:</p>
    <ul>
      <li>Apri l'app e tocca <strong>Registrati</strong></li>
      <li>Inserisci il tuo nome, indirizzo email e una password sicura</li>
      <li>Riceverai una email di verifica: clicca sul link per confermare il tuo account</li>
      <li>Dopo la verifica, effettua il login con le tue credenziali</li>
    </ul>

    <h3>Creare una Famiglia</h3>
    <ul>
      <li>Dalla schermata Home, inserisci il nome della tua famiglia (es. "Famiglia Rossi")</li>
      <li>Tocca il pulsante per creare la famiglia</li>
      <li>Diventerai automaticamente l'<strong>amministratore</strong> del gruppo</li>
    </ul>

    <h3>Invitare Membri</h3>
    <ul>
      <li>Vai alla scheda <strong>Famiglia</strong> e tocca il pulsante per aggiungere un membro</li>
      <li>Inserisci l'indirizzo email della persona che vuoi invitare</li>
      <li>Il familiare ricevera un link di invito per unirsi al gruppo</li>
      <li>Puoi assegnare un <strong>soprannome</strong> e un <strong>colore</strong> a ciascun membro</li>
    </ul>

    <h2 id="home">2. Home</h2>
    <p>La schermata Home e il centro di comando della tua famiglia. Qui trovi:</p>
    <ul>
      <li><strong>Prossimi Eventi:</strong> i 3 eventi in arrivo dal calendario condiviso, con data e luogo</li>
      <li><strong>Faccende da Fare:</strong> le 3 faccende piu urgenti ancora da completare</li>
      <li><strong>Classifica Punti:</strong> i primi 3 membri della famiglia per punti accumulati</li>
    </ul>
    <div class="tip"><strong>Suggerimento:</strong> La Home ti offre una panoramica rapida di tutto cio che serve per organizzare la giornata della tua famiglia.</div>

    <h2 id="calendario">3. Calendario Condiviso</h2>
    <p>Il calendario condiviso permette a tutta la famiglia di vedere e gestire gli impegni.</p>

    <h3>Visualizzare gli Eventi</h3>
    <ul>
      <li>Apri la scheda <strong>Calendario</strong> per vedere il mese corrente</li>
      <li>Tocca un giorno per vedere gli eventi di quella data</li>
      <li>Naviga tra i mesi usando le frecce in alto</li>
    </ul>

    <h3>Creare un Evento</h3>
    <p>Tocca il pulsante <strong>+</strong> nel calendario e compila i campi:</p>
    <ul>
      <li><strong>Titolo:</strong> nome dell'evento (es. "Compleanno della nonna")</li>
      <li><strong>Data:</strong> seleziona il giorno</li>
      <li><strong>Ora di inizio e fine:</strong> imposta gli orari</li>
      <li><strong>Luogo:</strong> dove si svolgera l'evento (opzionale)</li>
      <li><strong>Descrizione:</strong> note aggiuntive (opzionale)</li>
      <li><strong>Colore:</strong> scegli un colore per identificare l'evento</li>
      <li><strong>Tutto il giorno:</strong> attiva se l'evento dura l'intera giornata</li>
    </ul>

    <h3>Eliminare un Evento</h3>
    <p>Nella lista degli eventi del giorno, tocca l'icona di eliminazione sull'evento.</p>

    <h2 id="spesa">4. Liste della Spesa</h2>
    <p>Crea e condividi le liste della spesa con tutta la famiglia.</p>

    <h3>Creare una Lista</h3>
    <ul>
      <li>Vai alla scheda <strong>Spesa</strong></li>
      <li>Tocca il pulsante <strong>+</strong> per creare una nuova lista</li>
      <li>Inserisci un nome per la lista (es. "Spesa settimanale")</li>
    </ul>

    <h3>Gestire gli Articoli</h3>
    <ul>
      <li>Tocca una lista per aprirla</li>
      <li>Aggiungi articoli inserendo il nome nel campo in basso</li>
      <li>Puoi specificare: <strong>quantita</strong>, <strong>unita</strong> (pz, kg, L, ecc.) e <strong>categoria</strong></li>
      <li>Tocca un articolo per segnarlo come <strong>completato</strong> (acquistato)</li>
      <li>Scorri su un articolo per <strong>eliminarlo</strong></li>
    </ul>

    <h3>Suggerimenti AI per la Spesa</h3>
    <p>Se hai attivato le funzionalita AI, puoi ricevere suggerimenti intelligenti basati su:</p>
    <ul>
      <li>Quello che la tua famiglia compra di solito</li>
      <li>Gli eventi in programma nel calendario</li>
      <li>La stagione corrente</li>
    </ul>
    <div class="tip"><strong>Suggerimento:</strong> I suggerimenti sono suddivisi per categoria: Alimentari, Casa e Pulizia, Cura Personale.</div>

    <h2 id="faccende">5. Faccende Domestiche</h2>
    <p>Organizza le faccende di casa con un sistema a punti che rende tutto piu divertente!</p>

    <h3>Creare una Faccenda</h3>
    <p>Tocca il pulsante <strong>+</strong> nella scheda Faccende e compila:</p>
    <ul>
      <li><strong>Titolo:</strong> nome della faccenda (es. "Lavare i piatti")</li>
      <li><strong>Descrizione:</strong> istruzioni o note (opzionale)</li>
      <li><strong>Difficolta:</strong> Facile, Media o Difficile</li>
      <li><strong>Punti:</strong> valore in punti (5, 10, 15, 20, 25, 50)</li>
      <li><strong>Tempo stimato:</strong> durata in minuti</li>
      <li><strong>Assegnata a:</strong> quale membro deve farla (opzionale)</li>
      <li><strong>Scadenza:</strong> entro quando va completata (opzionale)</li>
      <li><strong>Ricorrenza:</strong> Giornaliera, Settimanale o Mensile (opzionale)</li>
    </ul>

    <h3>Completare e Guadagnare Punti</h3>
    <ul>
      <li>Tocca l'icona di completamento sulla faccenda</li>
      <li>I punti vengono automaticamente aggiunti al membro assegnato</li>
      <li>La faccenda viene spostata nella sezione Completate</li>
    </ul>

    <h3>Filtri</h3>
    <ul>
      <li><strong>Da fare:</strong> faccende ancora in sospeso</li>
      <li><strong>Completate:</strong> faccende gia fatte</li>
      <li><strong>Tutte:</strong> mostra tutte le faccende</li>
    </ul>

    <div class="tip"><strong>Suggerimento:</strong> Piu faccende completi, piu sali in classifica! La classifica e visibile nella Home e nella scheda Famiglia.</div>

    <h2 id="famiglia">6. Gestione Famiglia</h2>

    <h3>Ruoli</h3>
    <ul>
      <li><strong>Amministratore:</strong> puo gestire i membri, modificare le impostazioni, gestire segnalazioni e invitare nuovi membri</li>
      <li><strong>Membro:</strong> puo utilizzare tutte le funzionalita di calendario, spesa e faccende</li>
    </ul>

    <h3>Gestione Membri</h3>
    <ul>
      <li>Visualizza tutti i membri dalla scheda <strong>Famiglia</strong></li>
      <li>L'amministratore puo modificare il <strong>nome della famiglia</strong></li>
      <li>Ogni membro mostra: ruolo, soprannome, colore e punti accumulati</li>
      <li>Solo gli amministratori possono rimuovere membri dal gruppo</li>
    </ul>

    <h2 id="ai">7. Suggerimenti AI</h2>
    <p>${APP_NAME} integra l'intelligenza artificiale per offrire suggerimenti utili alla tua famiglia.</p>

    <h3>Attivare/Disattivare l'AI</h3>
    <ul>
      <li>Vai alla scheda <strong>Famiglia</strong>, sezione <strong>Funzionalita</strong></li>
      <li>Usa il toggle per le <strong>Funzionalita AI</strong></li>
      <li>L'AI e completamente opzionale e rispetta la tua privacy</li>
    </ul>

    <h3>Tipi di Suggerimenti</h3>
    <ul>
      <li><strong>Suggerimenti Spesa:</strong> articoli consigliati in base alle abitudini, al calendario e alla stagione</li>
      <li><strong>Ottimizzazione Faccende:</strong> distribuzione equa delle faccende tra i membri</li>
      <li><strong>Insights Familiari:</strong> statistiche e consigli settimanali sulla gestione della famiglia</li>
    </ul>

    <h3>Privacy e Dati AI</h3>
    <ul>
      <li>I dati inviati all'AI sono <strong>aggregati e anonimizzati</strong></li>
      <li>Niente email, password, indirizzi o dati sensibili viene condiviso</li>
      <li>L'AI non viene usata per addestrare modelli esterni</li>
      <li>Puoi disattivare le funzionalita AI in qualsiasi momento</li>
    </ul>

    <h2 id="moderazione">8. Sicurezza e Moderazione</h2>
    <p>${APP_NAME} include strumenti per mantenere un ambiente sicuro e rispettoso.</p>

    <h3>Segnalare Contenuti o Utenti</h3>
    <ul>
      <li>Tocca l'opzione di segnalazione sull'elemento o sul profilo dell'utente</li>
      <li>Seleziona la categoria: Spam, Molestie, Odio, Contenuti Sessuali, Violenza, Altro</li>
      <li>Aggiungi una descrizione opzionale</li>
      <li>La segnalazione verra esaminata dall'amministratore del gruppo</li>
    </ul>

    <h3>Bloccare un Utente</h3>
    <ul>
      <li>Vai alle impostazioni e tocca <strong>Utenti Bloccati</strong></li>
      <li>Quando blocchi qualcuno, i suoi contenuti non saranno piu visibili per te</li>
      <li>La persona bloccata non viene notificata</li>
      <li>Puoi <strong>sbloccare</strong> un utente in qualsiasi momento</li>
    </ul>

    <h3>Gestione Segnalazioni (Solo Amministratori)</h3>
    <ul>
      <li>Accedi al pannello <strong>Segnalazioni</strong> dalla scheda Famiglia</li>
      <li>Filtra le segnalazioni per stato: Aperte, Gestite, Archiviate</li>
      <li>Per ogni segnalazione: prendi provvedimenti o archivia</li>
    </ul>

    <h2 id="impostazioni">9. Impostazioni e Account</h2>

    <h3>Sicurezza dell'Account</h3>
    <ul>
      <li>La password e protetta con crittografia avanzata</li>
      <li>Le sessioni scadono automaticamente dopo 7 giorni</li>
      <li>Puoi richiedere un reset della password dalla schermata di login</li>
    </ul>

    <h3>Documenti e Risorse</h3>
    <p>Dalla scheda Famiglia, nella sezione Legale, puoi consultare:</p>
    <ul>
      <li><strong>Privacy Policy:</strong> come vengono trattati i tuoi dati personali</li>
      <li><strong>Termini d'Uso:</strong> le condizioni di utilizzo del servizio</li>
      <li><strong>Guida Utente:</strong> questa guida (sempre aggiornata)</li>
    </ul>

    <h3>Logout</h3>
    <p>Tocca il pulsante <strong>Esci</strong> in fondo alla scheda Famiglia per disconnetterti.</p>

    <h2 id="sync">10. Sincronizzazione in Tempo Reale</h2>
    <p>${APP_NAME} sincronizza automaticamente tutti i dati tra i dispositivi dei membri della famiglia.</p>
    <ul>
      <li>Quando un membro aggiunge un evento, un articolo o completa una faccenda, <strong>tutti i dispositivi</strong> vengono aggiornati istantaneamente</li>
      <li>Non serve aggiornare manualmente: gli aggiornamenti arrivano in tempo reale</li>
      <li>Se sei offline, i dati vengono salvati localmente e sincronizzati al ripristino della connessione</li>
    </ul>
    <div class="tip"><strong>Cosa viene sincronizzato:</strong> eventi calendario, articoli spesa, faccende, modifiche ai membri della famiglia.</div>

    <h2 id="faq">11. Domande Frequenti</h2>

    <h3>Quanti membri posso aggiungere?</h3>
    <p>Non c'e un limite al numero di membri che puoi invitare nella tua famiglia.</p>

    <h3>Posso far parte di piu famiglie?</h3>
    <p>Al momento puoi appartenere a un gruppo familiare alla volta.</p>

    <h3>I miei dati sono al sicuro?</h3>
    <p>Si. Utilizziamo crittografia avanzata, connessioni protette HTTPS e autenticazione con token. Consulta la Privacy Policy per tutti i dettagli.</p>

    <h3>L'AI e obbligatoria?</h3>
    <p>No. Le funzionalita AI sono completamente opzionali. Puoi attivarle o disattivarle in qualsiasi momento.</p>

    <h3>Come funziona il sistema di punti?</h3>
    <p>Ogni faccenda ha un valore in punti (da 5 a 50). Quando completi una faccenda, i punti vengono aggiunti al tuo punteggio. La classifica mostra chi ha accumulato piu punti.</p>

    <h3>Posso usare ${APP_NAME} su piu dispositivi?</h3>
    <p>Si! ${APP_NAME} funziona su iPhone, Android e web. I tuoi dati sono sincronizzati in tempo reale su tutti i dispositivi.</p>

    <h3>Come posso segnalare un problema?</h3>
    <p>Puoi contattarci all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> per qualsiasi problema o suggerimento.</p>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlWrapper('Guida Utente', body));
});

export default router;
