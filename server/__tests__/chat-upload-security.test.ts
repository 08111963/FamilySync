import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {
  isAllowedUploadMime,
  resolveUploadExtension,
  buildStoredFilename,
  resolveSafeUploadPath,
  MIME_EXTENSIONS,
} from "../routes/chat";

const uploadsDir = path.resolve("uploads");

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
