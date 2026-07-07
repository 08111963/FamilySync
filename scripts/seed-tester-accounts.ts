/**
 * Seed manuale dei 15 ACCOUNT TESTER per il test chiuso di Google Play Console
 * + generazione del PDF con le credenziali.
 *
 * Rigenera da zero gli account tester (modalita reset) sul database puntato da
 * DATABASE_URL e scrive docs/tester-accounts.pdf. La logica di seeding vive in
 * server/lib/tester-accounts.ts ed e la stessa usata all'avvio del server (che
 * pero crea solo i mancanti).
 *
 * Le password sono derivate da SESSION_SECRET (secret globale), quindi il PDF
 * resta valido anche per gli account creati in produzione dopo il deploy.
 *
 * Avvio:  npx tsx scripts/seed-tester-accounts.ts
 */
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  ensureTesterAccounts,
  getTesterCredentials,
  TESTER_TRIAL_DAYS,
  type TesterCredential,
} from "../server/lib/tester-accounts";

const OUTPUT_PATH = path.resolve(process.cwd(), "docs", "tester-accounts.pdf");

function generatePdf(creds: TesterCredential[]): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(OUTPUT_PATH);
    doc.pipe(stream);

    const INK = "#1E293B";
    const MUTED = "#64748B";
    const ACCENT = "#6366F1";

    // Intestazione
    doc.fillColor(ACCENT).fontSize(24).font("Helvetica-Bold").text("FamilySync");
    doc.moveDown(0.2);
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text("Account per i tester (Google Play)");
    doc.moveDown(0.6);

    doc
      .fillColor(MUTED)
      .fontSize(10)
      .font("Helvetica")
      .text(
        `Questi ${creds.length} account hanno accesso a TUTTE le funzioni (Premium) per ` +
          `${TESTER_TRIAL_DAYS} giorni a partire dal primo accesso di ciascun account. ` +
          `Trascorsi i ${TESTER_TRIAL_DAYS} giorni l'account continua a funzionare ma solo ` +
          `con le funzioni gratuite. L'email e gia verificata: si accede subito con email e password.`,
        { align: "left" },
      );
    doc.moveDown(0.4);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font("Helvetica-Oblique")
      .text(`Documento generato il ${new Date().toLocaleDateString("it-IT")}. Conservare con cura: contiene le password.`);
    doc.moveDown(1);

    // Tabella
    const startX = doc.x;
    let y = doc.y;
    const colNum = startX;
    const colEmail = startX + 30;
    const colPwd = startX + 260;
    const rowH = 26;

    const drawHeader = () => {
      doc.fillColor("#FFFFFF").rect(startX, y, 495, 22).fill(ACCENT);
      doc.fillColor("#FFFFFF").fontSize(10).font("Helvetica-Bold");
      doc.text("#", colNum + 6, y + 6);
      doc.text("Email", colEmail + 6, y + 6);
      doc.text("Password", colPwd + 6, y + 6);
      y += 22;
    };

    drawHeader();

    creds.forEach((c, i) => {
      if (y + rowH > doc.page.height - 60) {
        doc.addPage();
        y = doc.y;
        drawHeader();
      }
      if (i % 2 === 1) {
        doc.fillColor("#F1F5F9").rect(startX, y, 495, rowH).fill();
      }
      doc.fillColor(INK).fontSize(10).font("Helvetica");
      doc.text(String(c.index), colNum + 6, y + 8);
      doc.text(c.email, colEmail + 6, y + 8, { width: 220 });
      doc.font("Courier-Bold").fillColor("#0F172A").text(c.password, colPwd + 6, y + 8);
      y += rowH;
    });

    doc.end();
    stream.on("finish", () => resolve(OUTPUT_PATH));
    stream.on("error", reject);
  });
}

async function main() {
  const result = await ensureTesterAccounts({ reset: true, force: true });
  if (result.skipped) {
    console.log("\nSeed tester SALTATO.");
    if (result.reason === "missing_secret") {
      console.log("Motivo: SESSION_SECRET non e impostato (serve per derivare le password).");
    }
    process.exit(0);
  }

  const creds = getTesterCredentials();
  const pdfPath = await generatePdf(creds);

  console.log("\n========================================");
  console.log("  ACCOUNT TESTER - PRONTI");
  console.log("========================================");
  console.log(`  Account creati/verificati: ${creds.length}`);
  console.log(`  Prova completa: ${TESTER_TRIAL_DAYS} giorni dal primo accesso`);
  console.log(`  PDF credenziali: ${pdfPath}`);
  console.log("========================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore durante il seed degli account tester:", err);
  process.exit(1);
});
