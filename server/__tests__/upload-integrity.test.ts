/**
 * Test: scansione integrità upload (Task allegati orfani).
 *
 * Verifica che runUploadIntegrityScanOnce:
 * - rilevi file_url/avatar_url che puntano a file inesistenti nel bucket;
 * - NON segnali file esistenti né avatar esterni (http/https);
 * - segnali come "invalid" gli URL con path traversal;
 * - con UPLOAD_INTEGRITY_AUTO_CLEAN=true azzeri file_url/avatar_url e
 *   cancelli le righe bill_attachments orfane;
 * - lanci (fail-closed) se il bucket non risponde, senza toccare il DB.
 *
 * Richiede DATABASE_URL; il bucket è simulato in-memory.
 */
import "./helpers/test-env-object-storage";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "stream";

const hasDb = !!process.env.DATABASE_URL;

describe("upload integrity scan", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let db: typeof import("../db")["db"];
  let schema: typeof import("../../shared/schema");
  let integrity: typeof import("../lib/upload-integrity");
  let eq: typeof import("drizzle-orm")["eq"];

  const bucket = new Map<string, Buffer>();
  let failExists = false;
  let failList = false;

  const suffix = Date.now().toString(36);
  let familyId: string;
  let userId: string;
  let billId: string;
  const msgIds: Record<string, string> = {};
  let attachmentId: string;

  before(async () => {
    const storage = await import("../lib/upload-storage");
    storage.__setObjectStorageClientForTests({
      async exists(key: string) {
        if (failExists) return { ok: false as const, error: new Error("bucket giù") };
        return { ok: true as const, value: bucket.has(key) };
      },
      async uploadFromFilename() {
        return { ok: true as const };
      },
      async delete(key: string) {
        bucket.delete(key);
        return { ok: true as const };
      },
      async list({ prefix }: { prefix?: string } = {}) {
        if (failList) return { ok: false as const, error: new Error("bucket giù") };
        const names = Array.from(bucket.keys())
          .filter((k) => !prefix || k.startsWith(prefix))
          .map((name) => ({ name }));
        return { ok: true as const, value: names };
      },
      downloadAsStream() {
        return new Readable({ read() {} });
      },
    });

    ({ db } = await import("../db"));
    schema = await import("../../shared/schema");
    ({ eq } = await import("drizzle-orm"));
    integrity = await import("../lib/upload-integrity");

    // Dati di test isolati.
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `upload-integrity-${suffix}@test.local`,
        name: "Integrity Tester",
        avatarUrl: `/uploads/avatars/missing-${suffix}.jpg`, // orfano
      })
      .returning({ id: schema.users.id });
    userId = user.id;

    const [family] = await db
      .insert(schema.families)
      .values({ name: `Integrity Test ${suffix}` })
      .returning({ id: schema.families.id });
    familyId = family.id;

    // File presente nel bucket.
    bucket.set(`uploads/ok-${suffix}.png`, Buffer.from("x"));

    const inserted = await db
      .insert(schema.chatMessages)
      .values([
        { familyId, userId, messageType: "image", fileUrl: `/uploads/ok-${suffix}.png` },
        { familyId, userId, messageType: "image", fileUrl: `/uploads/missing-${suffix}.png` },
        { familyId, userId, messageType: "file", fileUrl: `/uploads/../../tmp/evil-${suffix}.txt` },
      ])
      .returning({ id: schema.chatMessages.id, fileUrl: schema.chatMessages.fileUrl });
    for (const row of inserted) msgIds[row.fileUrl!] = row.id;

    const [bill] = await db
      .insert(schema.bills)
      .values({
        familyId,
        title: `Bolletta test ${suffix}`,
        amount: "10.00",
        dueDate: "2026-12-31",
        createdBy: userId,
      })
      .returning({ id: schema.bills.id });
    billId = bill.id;

    const [att] = await db
      .insert(schema.billAttachments)
      .values({ billId, familyId, fileUrl: `/uploads/bill-missing-${suffix}.pdf` })
      .returning({ id: schema.billAttachments.id });
    attachmentId = att.id;
  });

  after(async () => {
    // families cascade elimina chat/bills/attachments; poi l'utente.
    if (familyId) await db.delete(schema.families).where(eq(schema.families.id, familyId));
    if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  function myOrphans(report: import("../lib/upload-integrity").UploadIntegrityReport) {
    return report.orphans.filter((o) => o.fileUrl.includes(suffix));
  }

  test("rileva orfani senza toccare il DB (auto-clean off)", async () => {
    delete process.env.UPLOAD_INTEGRITY_AUTO_CLEAN;
    const report = await integrity.runUploadIntegrityScanOnce();
    assert.equal(report.autoClean, false);

    const found = myOrphans(report);
    const urls = found.map((o) => o.fileUrl).sort();
    assert.deepEqual(urls, [
      `/uploads/../../tmp/evil-${suffix}.txt`,
      `/uploads/avatars/missing-${suffix}.jpg`,
      `/uploads/bill-missing-${suffix}.pdf`,
      `/uploads/missing-${suffix}.png`,
    ]);
    // Il file esistente NON è tra gli orfani.
    assert.ok(!report.orphans.some((o) => o.fileUrl === `/uploads/ok-${suffix}.png`));
    // Motivi corretti.
    const traversal = found.find((o) => o.fileUrl.includes("evil"));
    assert.equal(traversal?.reason, "invalid");
    assert.ok(found.every((o) => !o.cleaned));

    // DB intatto.
    const [msg] = await db
      .select({ fileUrl: schema.chatMessages.fileUrl })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, msgIds[`/uploads/missing-${suffix}.png`]));
    assert.equal(msg.fileUrl, `/uploads/missing-${suffix}.png`);
  });

  test("avatar esterni http/https non sono orfani", async () => {
    assert.equal(await integrity.checkStoredUpload("https://example.com/a.jpg"), "ok");
  });

  test("fail-closed: errore bucket interrompe la scansione", async () => {
    failExists = true;
    try {
      await assert.rejects(() => integrity.runUploadIntegrityScanOnce());
    } finally {
      failExists = false;
    }
  });

  test("auto-clean azzera/elimina le righe orfane", async () => {
    process.env.UPLOAD_INTEGRITY_AUTO_CLEAN = "true";
    try {
      const report = await integrity.runUploadIntegrityScanOnce();
      assert.equal(report.autoClean, true);
      assert.ok(myOrphans(report).every((o) => o.cleaned));

      const [msg] = await db
        .select({ fileUrl: schema.chatMessages.fileUrl })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.id, msgIds[`/uploads/missing-${suffix}.png`]));
      assert.equal(msg.fileUrl, null);

      const [okMsg] = await db
        .select({ fileUrl: schema.chatMessages.fileUrl })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.id, msgIds[`/uploads/ok-${suffix}.png`]));
      assert.equal(okMsg.fileUrl, `/uploads/ok-${suffix}.png`);

      const [user] = await db
        .select({ avatarUrl: schema.users.avatarUrl })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      assert.equal(user.avatarUrl, null);

      const atts = await db
        .select({ id: schema.billAttachments.id })
        .from(schema.billAttachments)
        .where(eq(schema.billAttachments.id, attachmentId));
      assert.equal(atts.length, 0);
    } finally {
      delete process.env.UPLOAD_INTEGRITY_AUTO_CLEAN;
    }
  });

  test("bucket→DB: file non referenziato segnalato solo dopo il periodo di grazia", async () => {
    integrity.__resetForgottenTrackingForTests();
    process.env.UPLOAD_INTEGRITY_GRACE_MS = "0";
    bucket.set(`uploads/forgotten-${suffix}.bin`, Buffer.from("x"));
    bucket.set(`uploads/recipe-images/cache-${suffix}.webp`, Buffer.from("x"));
    try {
      // Prima vista: solo tracking (grazia), nessuna segnalazione.
      let report = await integrity.runUploadIntegrityScanOnce();
      assert.ok(!report.forgotten.some((f) => f.key.includes(suffix)));

      // Seconda vista (grazia scaduta): segnalato ma NON eliminato (auto-clean off).
      report = await integrity.runUploadIntegrityScanOnce();
      const mine = report.forgotten.filter((f) => f.key.includes(suffix));
      assert.deepEqual(
        mine.map((f) => f.key),
        [`uploads/forgotten-${suffix}.bin`]
      );
      assert.ok(mine.every((f) => !f.deleted));
      assert.ok(bucket.has(`uploads/forgotten-${suffix}.bin`));
      // Il file referenziato e la cache ricette NON sono segnalati.
      assert.ok(!report.forgotten.some((f) => f.key === `uploads/ok-${suffix}.png`));
      assert.ok(!report.forgotten.some((f) => f.key.startsWith("uploads/recipe-images/")));
      assert.ok(report.bucketChecked >= 2);
    } finally {
      delete process.env.UPLOAD_INTEGRITY_GRACE_MS;
    }
  });

  test("bucket→DB: auto-clean elimina i file dimenticati oltre la grazia", async () => {
    integrity.__resetForgottenTrackingForTests();
    process.env.UPLOAD_INTEGRITY_GRACE_MS = "0";
    process.env.UPLOAD_INTEGRITY_AUTO_CLEAN = "true";
    try {
      // Prima vista: grazia, il file resta.
      await integrity.runUploadIntegrityScanOnce();
      assert.ok(bucket.has(`uploads/forgotten-${suffix}.bin`));

      // Seconda vista: eliminato dal bucket.
      const report = await integrity.runUploadIntegrityScanOnce();
      const mine = report.forgotten.filter((f) => f.key.includes(suffix));
      assert.deepEqual(
        mine.map((f) => f.key),
        [`uploads/forgotten-${suffix}.bin`]
      );
      assert.ok(mine.every((f) => f.deleted));
      assert.ok(!bucket.has(`uploads/forgotten-${suffix}.bin`));
      // Il file referenziato e la cache ricette restano intatti.
      assert.ok(bucket.has(`uploads/ok-${suffix}.png`));
      assert.ok(bucket.has(`uploads/recipe-images/cache-${suffix}.webp`));
    } finally {
      delete process.env.UPLOAD_INTEGRITY_GRACE_MS;
      delete process.env.UPLOAD_INTEGRITY_AUTO_CLEAN;
    }
  });

  test("bucket→DB fail-closed: errore list interrompe la scansione", async () => {
    failList = true;
    try {
      await assert.rejects(() => integrity.runUploadIntegrityScanOnce());
    } finally {
      failList = false;
    }
  });
});
