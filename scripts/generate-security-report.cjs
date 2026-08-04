// Genera il report PDF sulla scansione di sicurezza (04/08/2026).
// Uso: node scripts/generate-security-report.cjs
const PDFDocument = require("pdfkit");
const fs = require("fs");

const OUT = "attached_assets/report-sicurezza-2026-08-04.pdf";
const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
doc.pipe(fs.createWriteStream(OUT));

const ACCENT = "#FF6B6B";
const TEXT = "#222222";
const GRAY = "#555555";

function h1(t) { doc.moveDown(0.6); doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(16).text(t); doc.moveDown(0.3); }
function h2(t) { doc.moveDown(0.4); doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(12.5).text(t); doc.moveDown(0.15); }
function p(t) { doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text(t, { lineGap: 2 }); doc.moveDown(0.2); }
function li(t) { doc.fillColor(TEXT).font("Helvetica").fontSize(10.5).text("•  " + t, { indent: 10, lineGap: 2 }); }
function badge(label, color) {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(color).text(label, { continued: true }).fillColor(TEXT).font("Helvetica");
}

// Copertina/testata
doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(24).text("FamilySync");
doc.fillColor(TEXT).fontSize(18).text("Report di Sicurezza");
doc.fillColor(GRAY).font("Helvetica").fontSize(11).text("Scansione e interventi del 4 agosto 2026  •  familysync.eu");
doc.moveDown(0.3);
doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(ACCENT).lineWidth(2).stroke();

h1("In sintesi");
p("È stata eseguita una scansione di sicurezza completa dell'applicazione (backend, autenticazione, pagamenti, feed pubblici). Sono stati individuati 8 punti deboli. I due più urgenti nella configurazione e nei feed calendario sono già stati corretti e portati nel codice; le correzioni per gli accessi tra famiglie diverse (IDOR) sono pronte e in fase di integrazione; il rafforzamento dei token di accesso è in lavorazione.");

h1("Cosa è stato già corretto");
h2("1. Protezione del browser (Content Security Policy)");
p("Prima: la protezione CSP era completamente disattivata, lasciando la web app più esposta ad attacchi di tipo XSS (script malevoli iniettati nella pagina). Ora: il server invia regole rigorose che permettono al browser di caricare script solo dal nostro dominio, bloccano iframe e oggetti esterni e limitano le connessioni a quelle necessarie (API, RevenueCat).");
h2("2. Iniezione nei feed calendario pubblici (ICS)");
p("Prima: un carattere speciale (\\r) inserito nel titolo o nella descrizione di un evento poteva 'spezzare' il file calendario pubblico e iniettare righe arbitrarie nel feed. Ora: tutti i caratteri di controllo vengono rimossi o resi innocui, con test automatici a garanzia.");
h2("3. Foto pubbliche servite in modo controllato");
p("Le foto pubbliche (ricette e avatar) sono ora servite con un'intestazione dedicata che ne consente la visualizzazione dalle anteprime, mentre tutti gli altri file caricati restano protetti da autenticazione.");

h1("Correzioni pronte, in fase di integrazione");
h2("Accessi incrociati tra famiglie (BOLA / IDOR)");
li("Aggiornamento segnalazioni moderazione: la modifica filtrava solo per ID della segnalazione, non per famiglia — un admin poteva modificare segnalazioni di altre famiglie.");
li("Archiviazione suggerimenti AI: stesso problema — un membro poteva archiviare suggerimenti di altre famiglie.");
p("Regola adottata: ogni modifica o cancellazione su dati di famiglia deve filtrare anche per famiglia direttamente nella query al database, non solo nei controlli d'ingresso.");

h1("In lavorazione");
h2("Sicurezza di token e autenticazione");
li("Il cambio password non invalida i token di accesso già emessi (validi fino a 7 giorni): verrà introdotta la revoca.");
li("La protezione anti-riutilizzo dei codici di login Google/Apple è per-istanza: verrà spostata su stato condiviso (database).");
li("Il login non ha un limitatore dedicato contro i tentativi ripetuti di password: verrà aggiunto.");

h1("Altri punti emersi (rischio più basso)");
li("Registrazione tramite link famiglia: l'email viene marcata come verificata senza prova di possesso — prevista email di verifica.");
li("In ambiente di sviluppo alcuni log contengono link di verifica/reset: solo dev, ma da ridurre.");
li("Le chiavi RevenueCat visibili nella configurazione sono chiavi pubbliche del SDK mobile: non sono segreti.");

h1("Conclusione");
p("Nessuna delle vulnerabilità trovate risulta sfruttata. Le due correzioni più importanti sono già attive nel codice; per essere efficaci sul sito pubblico serve una nuova pubblicazione. Le attività rimanenti sono tracciate come task di progetto e verranno completate a breve.");

doc.moveDown(1);
doc.fillColor(GRAY).fontSize(9).text("Report generato automaticamente il 4 agosto 2026 sulla base della scansione di sicurezza e del modello delle minacce (threat_model.md).");

doc.end();
console.log("OK " + OUT);
