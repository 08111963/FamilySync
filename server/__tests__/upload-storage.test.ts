/**
 * Test: un allegato caricato sopravvive a un riavvio/redeploy (Task upload persistente).
 *
 * Con STORAGE_MODE=object-storage:
 * - persistUploadedFile carica il file nel bucket e RIMUOVE la copia locale
 *   (niente scritture "solo disco locale" per gli upload utente);
 * - dopo un "redeploy" simulato (disco locale azzerato) il file resta
 *   scaricabile dal handler che serve dal bucket;
 * - deleteStoredUploads rimuove l'oggetto dal bucket (oltre al disco);
 * - il handler fa fallback a next() (static locale) per i file legacy non
 *   presenti nel bucket.
 *
 * Il bucket è simulato in-memory tramite l'hook __setObjectStorageClientForTests.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PassThrough, Readable } from "stream";

// IMPORTANTE: la modalità è letta al momento dell'import del modulo, quindi
// l'env va impostata PRIMA dell'import dinamico.
process.env.STORAGE_MODE = "object-storage";

type UploadStorage = typeof import("../lib/upload-storage");
let mod: UploadStorage;

// Bucket fittizio in-memory che PERSISTE tra i test (simula l'object storage
// che sopravvive al riavvio del server).
const bucket = new Map<string, Buffer>();
let failNextUpload = false;
let failNextDelete = false;

const fakeClient = {
  async uploadFromFilename(key: string, localPath: string) {
    if (failNextUpload) {
      failNextUpload = false;
      return { ok: false as const, error: new Error("upload simulato fallito") };
    }
    bucket.set(key, await fs.readFile(localPath));
    return { ok: true as const };
  },
  async delete(key: string) {
    if (failNextDelete) {
      failNextDelete = false;
      return { ok: false as const, error: new Error("delete simulata fallita") };
    }
    bucket.delete(key);
    return { ok: true as const };
  },
  async exists(key: string) {
    return { ok: true as const, value: bucket.has(key) };
  },
  downloadAsStream(key: string) {
    const data = bucket.get(key);
    if (!data) {
      const s = new Readable({ read() {} });
      process.nextTick(() => s.emit("error", new Error("not found")));
      return s;
    }
    return Readable.from(data);
  },
};

before(async () => {
  mod = await import("../lib/upload-storage");
  mod.__setObjectStorageClientForTests(fakeClient);
});

async function writeTempUpload(name: string, content: string): Promise<string> {
  const dir = path.resolve("uploads");
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, name);
  await fs.writeFile(p, content);
  return p;
}

type FakeRes = PassThrough & {
  headers: Record<string, string>;
  statusCode: number;
  ended: boolean;
  setHeader(k: string, v: string): void;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
  headersSent: boolean;
};

function makeRes(): FakeRes {
  const res = new PassThrough() as FakeRes;
  res.headers = {};
  res.statusCode = 200;
  res.ended = false;
  res.headersSent = false;
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
    res.headersSent = true;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = () => res;
  return res;
}

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c) => chunks.push(Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

describe("modalità object-storage attiva", () => {
  test("STORAGE_MODE=object-storage viene rispettato (fail se torna local-only)", () => {
    assert.equal(mod.storageMode, "object-storage");
    assert.equal(mod.isObjectStorageMode(), true);
  });
});

describe("objectKeyFromUrl — solo percorsi /uploads sicuri", () => {
  test("percorsi validi", () => {
    assert.equal(mod.objectKeyFromUrl("/uploads/abc.jpg"), "uploads/abc.jpg");
    assert.equal(mod.objectKeyFromUrl("/uploads/avatars/x-1.png"), "uploads/avatars/x-1.png");
  });
  test("URL esterni, traversal e caratteri fuori allowlist rifiutati", () => {
    assert.equal(mod.objectKeyFromUrl("https://evil.com/uploads/a.jpg"), null);
    assert.equal(mod.objectKeyFromUrl("/uploads/../secret.txt"), null);
    assert.equal(mod.objectKeyFromUrl("/uploads/a b.jpg"), null);
    assert.equal(mod.objectKeyFromUrl("/etc/passwd"), null);
    assert.equal(mod.objectKeyFromUrl(null), null);
    assert.equal(mod.objectKeyFromUrl(""), null);
  });
});

describe("persistUploadedFile — l'upload finisce nel bucket, non solo su disco", () => {
  test("carica nel bucket e rimuove il file locale temporaneo", async () => {
    const local = await writeTempUpload("test-bolletta.pdf", "PDF-CONTENUTO");
    await mod.persistUploadedFile(local, "/uploads/test-bolletta.pdf");

    assert.ok(bucket.has("uploads/test-bolletta.pdf"), "il file deve stare nel bucket");
    assert.equal(bucket.get("uploads/test-bolletta.pdf")!.toString(), "PDF-CONTENUTO");
    // Se questo assert fallisce, qualcuno ha reintrodotto scritture solo su
    // disco locale: su autoscale il file sparirebbe al redeploy.
    await assert.rejects(fs.access(local), "la copia locale temporanea deve essere rimossa");
  });

  test("lancia (niente fallback silenzioso) se l'upload sul bucket fallisce", async () => {
    const local = await writeTempUpload("test-fail.pdf", "X");
    failNextUpload = true;
    await assert.rejects(
      mod.persistUploadedFile(local, "/uploads/test-fail.pdf"),
      /Upload su object storage fallito/
    );
    await fs.unlink(local).catch(() => {});
  });

  test("lancia su fileUrl non valido (traversal)", async () => {
    await assert.rejects(
      mod.persistUploadedFile("/tmp/x", "/uploads/../evil"),
      /fileUrl non valido/
    );
  });
});

describe("sopravvivenza al redeploy — serving dal bucket senza file locale", () => {
  test("dopo la 'perdita' del disco locale il file resta scaricabile", async () => {
    // Il file è nel bucket (test precedente) e NON esiste più su disco:
    // esattamente lo stato dopo un redeploy su autoscale.
    await assert.rejects(fs.access(path.resolve("uploads/test-bolletta.pdf")));

    const handler = mod.createUploadsObjectHandler("/uploads");
    const res = makeRes();
    let nextCalled = false;
    await handler(
      { method: "GET", path: "/test-bolletta.pdf" } as any,
      res as any,
      () => { nextCalled = true; }
    );
    const body = await collect(res);
    assert.equal(nextCalled, false, "deve servire dal bucket, non fare fallback");
    assert.equal(body.toString(), "PDF-CONTENUTO");
    assert.equal(res.headers["content-type"], "application/pdf");
  });

  test("HEAD risponde 200 senza corpo", async () => {
    const handler = mod.createUploadsObjectHandler("/uploads");
    const res = makeRes();
    let ended = false;
    (res as any).end = () => { ended = true; return res; };
    await handler(
      { method: "HEAD", path: "/test-bolletta.pdf" } as any,
      res as any,
      () => assert.fail("non deve fare next()")
    );
    assert.equal(res.statusCode, 200);
    assert.ok(ended);
  });

  test("file legacy assente dal bucket -> next() (fallback allo static locale)", async () => {
    const handler = mod.createUploadsObjectHandler("/uploads");
    let nextCalled = false;
    await handler(
      { method: "GET", path: "/legacy-pre-migrazione.jpg" } as any,
      makeRes() as any,
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);
  });

  test("traversal e uscita dal mount -> next(), mai servito", async () => {
    const handler = mod.createUploadsObjectHandler("/uploads/avatars");
    bucket.set("uploads/segreto.pdf", Buffer.from("privato"));
    for (const p of ["/../segreto.pdf", "/..%2Fsegreto.pdf", "/%2e%2e/segreto.pdf"]) {
      let nextCalled = false;
      await handler(
        { method: "GET", path: decodeURIComponentSafe(p) } as any,
        makeRes() as any,
        () => { nextCalled = true; }
      );
      assert.equal(nextCalled, true, `traversal ${p} deve fare next()`);
    }
    bucket.delete("uploads/segreto.pdf");
  });
});

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

describe("deleteStoredUploads — la delete rimuove anche l'oggetto dal bucket", () => {
  test("rimuove dal bucket e non lancia", async () => {
    bucket.set("uploads/da-cancellare.png", Buffer.from("img"));
    const result = await mod.deleteStoredUploads(["/uploads/da-cancellare.png"]);
    assert.equal(bucket.has("uploads/da-cancellare.png"), false);
    assert.equal(result.failed, 0);
  });

  test("errore del bucket -> conteggiato in failed, nessuna eccezione", async () => {
    bucket.set("uploads/che-non-si-cancella.png", Buffer.from("img"));
    failNextDelete = true;
    const result = await mod.deleteStoredUploads(["/uploads/che-non-si-cancella.png"]);
    assert.equal(result.failed, 1);
    bucket.delete("uploads/che-non-si-cancella.png");
  });

  test("URL non sicuri ignorati senza toccare il bucket", async () => {
    const sizeBefore = bucket.size;
    await mod.deleteStoredUploads(["https://x/uploads/a.jpg", "/uploads/../b", null, undefined]);
    assert.equal(bucket.size, sizeBefore);
  });
});

describe("guardia anti-regressione — le rotte upload usano lo storage persistente", () => {
  // Se qualcuno rimuove persistUploadedFile dalle rotte di upload (tornando a
  // scritture solo su disco locale) o smonta il handler bucket, questi test
  // falliscono.
  test("bills/chat/profile chiamano persistUploadedFile dopo multer", async () => {
    for (const file of ["bills.ts", "chat.ts", "profile.ts"]) {
      const src = await fs.readFile(path.resolve("server/routes", file), "utf8");
      assert.match(
        src,
        /await persistUploadedFile\(/,
        `server/routes/${file} deve rendere persistenti gli upload con persistUploadedFile()`
      );
    }
  });

  test("routes.ts monta createUploadsObjectHandler su /uploads e /uploads/avatars", async () => {
    const src = await fs.readFile(path.resolve("server/routes.ts"), "utf8");
    // Il mount avatar può avere middleware intermedi (CORP + header privacy),
    // ma DEVE includere il bucket handler con il prefisso corretto.
    assert.match(src, /app\.use\(\s*'\/uploads\/avatars',[\s\S]*?createUploadsObjectHandler\('\/uploads\/avatars'/);
    assert.match(src, /app\.use\('\/uploads',[\s\S]*?createUploadsObjectHandler\('\/uploads'\)/);
  });

  test("routes.ts: gli avatar pubblici hanno noindex e cache solo privata", async () => {
    const src = await fs.readFile(path.resolve("server/routes.ts"), "utf8");
    const avatarMount = src.slice(src.indexOf("avatarPrivacyHeaders"));
    assert.match(src, /X-Robots-Tag',\s*'noindex, nofollow'/);
    // Cache-Control privato sia per il bucket handler sia per express.static
    assert.match(
      avatarMount,
      /createUploadsObjectHandler\('\/uploads\/avatars',\s*\{\s*cacheControl:\s*'private, max-age=604800'/
    );
    assert.match(avatarMount, /setHeaders[\s\S]*?'Cache-Control',\s*'private, max-age=604800'/);
  });
});
