// Genera il PDF "Aggiungere un familiare senza email (profilo bambino)".
// Uso: node scripts/generate-child-profile-guide.cjs
const PDFDocument = require("pdfkit");
const fs = require("fs");

const OUT = "attached_assets/guida-profilo-bambino-senza-email.pdf";
const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
doc.pipe(fs.createWriteStream(OUT));

const ACCENT = "#FF6B6B";
const TEXT = "#222222";
const GRAY = "#555555";

function h1(t) { doc.moveDown(0.6); doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(15).text(t); doc.moveDown(0.25); }
function p(t) { doc.fillColor(TEXT).font("Helvetica").fontSize(11).text(t, { lineGap: 2.5 }); doc.moveDown(0.25); }
function li(t) { doc.fillColor(TEXT).font("Helvetica").fontSize(11).text("•  " + t, { indent: 10, lineGap: 2.5 }); }
function step(n, t) {
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(11).text(n + ".  ", { continued: true });
  doc.fillColor(TEXT).font("Helvetica").text(t, { lineGap: 2.5 });
  doc.moveDown(0.15);
}

// Testata
doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(24).text("FamilySync");
doc.fillColor(TEXT).fontSize(17).text("Aggiungere un familiare senza email");
doc.fillColor(GRAY).font("Helvetica").fontSize(11).text("Il profilo bambino gestito dai genitori");
doc.moveDown(0.3);
doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor(ACCENT).lineWidth(2).stroke();

h1("A cosa serve");
p("I bambini piccoli spesso non hanno un indirizzo email (e sotto i 14 anni non possono creare un account per motivi di privacy). Con il profilo bambino non serve: il genitore lo crea in pochi secondi e il bambino compare in famiglia come tutti gli altri membri, senza account, senza email e senza password.");

h1("Come si crea (30 secondi)");
step(1, "Apri l'app e vai alla scheda \u201CFamiglia\u201D in basso.");
step(2, "Tocca \u201CAggiungi\u201D nella sezione Membri.");
step(3, "In alto, alla domanda \u201CCome vuoi invitare?\u201D, scegli \u201CBambino\u201D.");
step(4, "Scrivi solo il nome del bambino (es. \u201CSofia\u201D).");
step(5, "Tocca \u201CCrea profilo bambino\u201D. Fatto!");
p("Nota: possono creare un profilo bambino solo i membri con ruolo Admin o Adulto.");

h1("Cosa può fare il profilo bambino");
li("Ricevere faccende assegnate e guadagnare punti quando vengono completate.");
li("Comparire nella classifica dei punti e riscattare i premi di famiglia.");
li("Essere indicato negli eventi del calendario e nei piani della famiglia.");

h1("Cosa NON fa (ed è voluto)");
li("Non accede all'app: niente login, niente password.");
li("Non riceve email né notifiche.");
li("Non può essere contattato: non viene raccolto nessun dato di contatto del minore.");

h1("Gestione da parte dei genitori");
li("Rinominare: dalla scheda Famiglia, tocca la matita sulla riga del bambino e cambia il nome.");
li("Eliminare: Admin e Adulti possono rimuovere il profilo in qualsiasi momento (icona cestino).");
li("Il profilo conta nel limite membri del piano: 5 membri col piano Free, illimitati col Premium.");

h1("E quando il bambino cresce?");
p("Quando avr\u00E0 la sua email (dai 14 anni in su), potr\u00E0 essere invitato normalmente dalla scheda Famiglia con il metodo Email, scegliendo il ruolo pi\u00F9 adatto (es. Adolescente). A quel punto avr\u00E0 il suo accesso personale all'app.");

doc.moveDown(1);
doc.fillColor(GRAY).fontSize(9).text("Guida generata il 4 agosto 2026. Trovi la guida completa nell'app: Famiglia \u2192 Assistenza \u2192 Guida Utente, oppure su familysync.eu/help/user-guide.");

doc.end();
console.log("OK " + OUT);
