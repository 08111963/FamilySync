// Test di regressione: il serving da object storage non deve MAI permettere a
// un mount pubblico (es. /uploads/avatars) di raggiungere chiavi private
// (es. uploads/<allegato> protetto da authenticateMedia).
//
// Esecuzione: STORAGE_MODE=object-storage npx tsx server/__tests__/upload-storage-traversal.test.ts

process.env.STORAGE_MODE = "object-storage";

import test from "node:test";
import assert from "node:assert/strict";
import { objectKeyFromUrl, createUploadsObjectHandler } from "../lib/upload-storage";

test("objectKeyFromUrl accetta solo percorsi /uploads sicuri", () => {
  assert.equal(objectKeyFromUrl("/uploads/abc.jpg"), "uploads/abc.jpg");
  assert.equal(objectKeyFromUrl("/uploads/avatars/x.png"), "uploads/avatars/x.png");
  assert.equal(objectKeyFromUrl("/uploads/../etc/passwd"), null);
  assert.equal(objectKeyFromUrl("/uploads/./x.png"), null);
  assert.equal(objectKeyFromUrl("https://evil/uploads/a.jpg"), null);
  assert.equal(objectKeyFromUrl("/etc/passwd"), null);
  assert.equal(objectKeyFromUrl(""), null);
  assert.equal(objectKeyFromUrl(null), null);
});

// Esegue l'handler con una finta request GET e riporta se ha chiamato next()
// (cioè NON ha provato a servire dal bucket) oppure ha tentato l'accesso.
async function handlerFallsThrough(mountPrefix: string, reqPath: string): Promise<boolean> {
  const handler = createUploadsObjectHandler(mountPrefix);
  let calledNext = false;
  let touchedBucket = false;
  const req = { method: "GET", path: reqPath } as any;
  const res = {
    setHeader: () => {
      touchedBucket = true;
    },
    status: () => ({ end: () => {}, json: () => {} }),
  } as any;
  await handler(req, res, () => {
    calledNext = true;
  });
  if (touchedBucket) return false;
  return calledNext;
}

test("mount pubblico avatars: traversal verso chiavi private -> next(), mai bucket", async () => {
  for (const p of [
    "/../segreto.pdf",
    "/..%2Fsegreto.pdf", // già decodificato da Express in "/../..." o lasciato: coperto comunque
    "/../../uploads/segreto.pdf",
    "/./segreto.pdf",
    "/..\\segreto.pdf",
  ]) {
    // decodeURIComponent applicato dall'handler: passiamo anche la forma encoded.
    assert.equal(
      await handlerFallsThrough("/uploads/avatars", p),
      true,
      `traversal non bloccato: ${p}`
    );
    assert.equal(
      await handlerFallsThrough("/uploads/avatars", encodeURI(p)),
      true,
      `traversal (encoded) non bloccato: ${p}`
    );
  }
});

test("percent-encoding malformato -> next(), nessun 500", async () => {
  assert.equal(await handlerFallsThrough("/uploads/avatars", "/%E0%A4%A"), true);
});

test("chiave fuori dal prefisso del mount -> next()", async () => {
  // Anche se il percorso è 'pulito', deve restare confinato al mount.
  assert.equal(await handlerFallsThrough("/uploads/avatars", "//../altro.png"), true);
});
