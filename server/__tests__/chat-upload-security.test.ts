import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  isAllowedUploadMime,
  resolveUploadExtension,
  buildStoredFilename,
  resolveSafeUploadPath,
  verifyMagicBytes,
  readMagicBytes,
  MIME_EXTENSIONS,
  MAGIC_VERIFIED_MIMES,
} from "../routes/chat";

const uploadsDir = path.resolve("uploads");

// Minimal valid signatures for each magic-verified type.
const VALID_SIGNATURES: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": Buffer.from("GIF89a", "latin1"),
  "image/webp": Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "latin1"),
  ]),
  "application/pdf": Buffer.from("%PDF-1.7\n", "latin1"),
};

describe("Caso 1 — upload con nome file spoofato", () => {
  test("il file salvato usa l'estensione del MIME consentito, non quella del nome originale", () => {
    // Client invia "documento.pdf" ma il MIME reale e' image/png.
    const mimetype = "image/png";
    const stored = buildStoredFilename(mimetype, "deadbeef");
    assert.equal(stored, "deadbeef.png");
    assert.ok(stored.endsWith(".png"), "deve finire con .png (coerente col MIME)");
    assert.ok(!stored.includes("documento"), "non deve usare il nome originale");
    assert.ok(!stored.endsWith(".pdf"), "non deve usare l'estensione del nome spoofato");
  });

  test("l'estensione e' determinata dalla mappa MIME consentiti", () => {
    assert.equal(resolveUploadExtension("image/jpeg"), ".jpg");
    assert.equal(resolveUploadExtension("application/pdf"), ".pdf");
    assert.equal(resolveUploadExtension("text/plain"), ".txt");
  });

  test("un MIME sconosciuto non produce estensione (nessun fallback al nome client)", () => {
    assert.equal(resolveUploadExtension("application/x-msdownload"), "");
    assert.equal(buildStoredFilename("application/x-msdownload", "abc"), "abc");
  });
});

describe("Caso 2 — upload con MIME non consentito", () => {
  test("i MIME consentiti passano il filtro", () => {
    for (const mime of Object.keys(MIME_EXTENSIONS)) {
      assert.equal(isAllowedUploadMime(mime), true, `${mime} dovrebbe essere consentito`);
    }
  });

  test("MIME non consentiti vengono respinti dal filtro", () => {
    const blocked = [
      "application/x-msdownload",
      "application/zip",
      "application/octet-stream",
      "text/html",
      "image/svg+xml",
      "application/javascript",
    ];
    for (const mime of blocked) {
      assert.equal(isAllowedUploadMime(mime), false, `${mime} dovrebbe essere respinto`);
    }
  });

  test("MIME spoofato (nome .pdf ma tipo non consentito) viene respinto in base al MIME", () => {
    // Il nome originale e' irrilevante: conta solo il MIME dichiarato.
    assert.equal(isAllowedUploadMime("application/zip"), false);
  });
});

describe("Caso 3 — delete con fileUrl contenente path traversal", () => {
  test("un fileUrl legittimo dentro uploads risolve a un percorso valido", () => {
    const safe = resolveSafeUploadPath("/uploads/abc123.png");
    assert.equal(safe, path.join(uploadsDir, "abc123.png"));
  });

  test("traversal con ../ verso l'esterno restituisce null (nessuna cancellazione)", () => {
    assert.equal(resolveSafeUploadPath("/uploads/../../etc/passwd"), null);
    assert.equal(resolveSafeUploadPath("/uploads/../../../etc/passwd"), null);
  });

  test("percorsi assoluti fuori da uploads restituiscono null", () => {
    assert.equal(resolveSafeUploadPath("/etc/passwd"), null);
    assert.equal(resolveSafeUploadPath("/var/log/syslog"), null);
  });

  test("la directory uploads stessa non e' un target valido", () => {
    assert.equal(resolveSafeUploadPath("/uploads"), null);
    assert.equal(resolveSafeUploadPath("/uploads/"), null);
  });

  test("un traversal che rientra in uploads resta confinato in uploads", () => {
    const safe = resolveSafeUploadPath("/uploads/sub/../valido.png");
    assert.equal(safe, path.join(uploadsDir, "valido.png"));
    assert.ok(safe!.startsWith(uploadsDir + path.sep));
  });
});

describe("Caso 4 — MIME spoofato verificato sui magic bytes", () => {
  test("contenuto valido supera la verifica per ogni tipo controllato", () => {
    for (const mime of MAGIC_VERIFIED_MIMES) {
      const sig = VALID_SIGNATURES[mime];
      assert.ok(sig, `manca una firma valida di test per ${mime}`);
      assert.equal(verifyMagicBytes(sig, mime), true, `${mime} con firma valida deve passare`);
    }
  });

  test("file dichiarato image/png ma con contenuto NON PNG viene respinto", () => {
    // Tipico spoof: mimetype image/png ma i byte sono testo/altro.
    const fakePng = Buffer.from("Questo non e' un PNG, e' testo semplice.", "utf8");
    assert.equal(verifyMagicBytes(fakePng, "image/png"), false);
  });

  test("contenuto PDF spacciato per image/png viene respinto", () => {
    const pdfBytes = Buffer.from("%PDF-1.7\n", "latin1");
    assert.equal(verifyMagicBytes(pdfBytes, "image/png"), false);
  });

  test("ogni firma valida fallisce se dichiarata come un altro tipo controllato", () => {
    for (const declared of MAGIC_VERIFIED_MIMES) {
      for (const [actual, sig] of Object.entries(VALID_SIGNATURES)) {
        if (actual === declared) continue;
        // webp inizia con RIFF: non collide con le altre firme controllate.
        assert.equal(
          verifyMagicBytes(sig, declared),
          false,
          `contenuto ${actual} dichiarato ${declared} deve essere respinto`
        );
      }
    }
  });

  test("buffer troppo corto non viene accettato per errore", () => {
    assert.equal(verifyMagicBytes(Buffer.from([0x89]), "image/png"), false);
    assert.equal(verifyMagicBytes(Buffer.alloc(0), "application/pdf"), false);
  });

  test("i tipi non verificabili (doc/docx/txt) passano sul MIME dichiarato (limite documentato)", () => {
    const anything = Buffer.from("contenuto qualsiasi", "utf8");
    assert.equal(verifyMagicBytes(anything, "text/plain"), true);
    assert.equal(verifyMagicBytes(anything, "application/msword"), true);
    assert.equal(
      verifyMagicBytes(anything, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      true
    );
  });

  test("simulazione handler: file spoofato viene cancellato dal disco e non genera record", () => {
    // Simula il flusso del route: multer ha gia' scritto il file su disco con
    // mimetype image/png; verifichiamo i magic bytes, e se falliscono il file
    // viene rimosso e NON si arriva all'insert nel DB.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-upload-test-"));
    const spoofedPath = path.join(tmpDir, "deadbeef.png");
    fs.writeFileSync(spoofedPath, Buffer.from("PK\x03\x04 non sono un png", "latin1"));

    let dbInserts = 0;
    const fakeInsert = () => { dbInserts += 1; };

    const magic = readMagicBytes(spoofedPath);
    let rejected = false;
    if (!verifyMagicBytes(magic, "image/png")) {
      fs.unlinkSync(spoofedPath);
      rejected = true;
    } else {
      fakeInsert();
    }

    assert.equal(rejected, true, "lo spoof deve essere respinto");
    assert.equal(fs.existsSync(spoofedPath), false, "il file spoofato non deve restare su disco");
    assert.equal(dbInserts, 0, "nessun record deve essere creato nel DB");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("file PNG legittimo: handler procede e il file resta su disco", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-upload-test-"));
    const goodPath = path.join(tmpDir, "cafebabe.png");
    fs.writeFileSync(goodPath, VALID_SIGNATURES["image/png"]);

    let dbInserts = 0;
    const magic = readMagicBytes(goodPath);
    if (verifyMagicBytes(magic, "image/png")) {
      dbInserts += 1;
    } else {
      fs.unlinkSync(goodPath);
    }

    assert.equal(dbInserts, 1, "un PNG valido deve generare un record");
    assert.equal(fs.existsSync(goodPath), true, "il file valido deve restare su disco");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
