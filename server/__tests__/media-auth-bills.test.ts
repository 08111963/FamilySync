import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveUploadFileAccess,
  authorizeMediaRequest,
  __setMediaAccessStoreForTest,
  __resetMediaAccessStoreForTest,
  type MediaAccessStore,
} from "../lib/media-auth";

interface FakeData {
  chat: Record<string, { familyId: string; authorId: string }>; // fileUrl -> chat access (per membro)
  bill: Record<string, { familyId: string }>; // fileUrl -> bill attachment access (per membro)
  premiumFamilies: Set<string>;
  blocks: Set<string>; // `${a}|${b}|${familyId}`
}

function makeStore(data: FakeData): MediaAccessStore {
  return {
    async findChatFileAccess(_userId, fileUrl) {
      return data.chat[fileUrl] ?? null;
    },
    async findBillAttachmentAccess(_userId, fileUrl) {
      return data.bill[fileUrl] ?? null;
    },
    async hasBlockRelationship(a, b, familyId) {
      return data.blocks.has(`${a}|${b}|${familyId}`) || data.blocks.has(`${b}|${a}|${familyId}`);
    },
    async isFamilyPremium(familyId) {
      return data.premiumFamilies.has(familyId);
    },
  };
}

afterEach(() => {
  __resetMediaAccessStoreForTest();
});

describe("resolveUploadFileAccess - allegati bollette", () => {
  test("membro di famiglia Premium apre l'allegato", async () => {
    __setMediaAccessStoreForTest(
      makeStore({
        chat: {},
        bill: { "/uploads/bill-1.pdf": { familyId: "fam-premium" } },
        premiumFamilies: new Set(["fam-premium"]),
        blocks: new Set(),
      })
    );
    const fam = await resolveUploadFileAccess("user-1", "/uploads/bill-1.pdf");
    assert.equal(fam, "fam-premium");
  });

  test("famiglia Free NON apre l'allegato (gating fail-closed)", async () => {
    __setMediaAccessStoreForTest(
      makeStore({
        chat: {},
        bill: { "/uploads/bill-1.pdf": { familyId: "fam-free" } },
        premiumFamilies: new Set(),
        blocks: new Set(),
      })
    );
    const fam = await resolveUploadFileAccess("user-1", "/uploads/bill-1.pdf");
    assert.equal(fam, null);
  });

  test("non-membro NON apre l'allegato (find ritorna null)", async () => {
    // Lo store applica già la membership: per un non-membro la find ritorna null.
    __setMediaAccessStoreForTest(
      makeStore({
        chat: {},
        bill: {},
        premiumFamilies: new Set(["fam-premium"]),
        blocks: new Set(),
      })
    );
    const fam = await resolveUploadFileAccess("estraneo", "/uploads/bill-1.pdf");
    assert.equal(fam, null);
  });

  test("file inesistente -> null", async () => {
    __setMediaAccessStoreForTest(
      makeStore({ chat: {}, bill: {}, premiumFamilies: new Set(), blocks: new Set() })
    );
    const fam = await resolveUploadFileAccess("user-1", "/uploads/nope.pdf");
    assert.equal(fam, null);
  });

  test("normalizza il path con o senza prefisso /uploads", async () => {
    __setMediaAccessStoreForTest(
      makeStore({
        chat: {},
        bill: { "/uploads/bill-9.jpg": { familyId: "fam-premium" } },
        premiumFamilies: new Set(["fam-premium"]),
        blocks: new Set(),
      })
    );
    const fam = await resolveUploadFileAccess("user-1", "/uploads/bill-9.jpg");
    assert.equal(fam, "fam-premium");
  });
});

describe("authorizeMediaRequest - cross-family / filePath", () => {
  test("token cross-family rifiutato", () => {
    const res = authorizeMediaRequest({
      requestedFileUrl: "/uploads/bill-1.pdf",
      fileFamilyId: "fam-A",
      tokenFamilyId: "fam-B",
    });
    assert.deepEqual(res, { ok: false, code: "FORBIDDEN_FILE" });
  });

  test("token con filePath diverso rifiutato", () => {
    const res = authorizeMediaRequest({
      requestedFileUrl: "/uploads/bill-1.pdf",
      fileFamilyId: "fam-A",
      tokenFilePath: "/uploads/other.pdf",
    });
    assert.deepEqual(res, { ok: false, code: "FORBIDDEN_FILE" });
  });

  test("file senza famiglia (accesso non risolto) rifiutato", () => {
    const res = authorizeMediaRequest({
      requestedFileUrl: "/uploads/bill-1.pdf",
      fileFamilyId: null,
    });
    assert.deepEqual(res, { ok: false, code: "FORBIDDEN_FILE" });
  });

  test("token corretto per stessa famiglia e stesso file -> ok", () => {
    const res = authorizeMediaRequest({
      requestedFileUrl: "/uploads/bill-1.pdf",
      fileFamilyId: "fam-A",
      tokenFamilyId: "fam-A",
      tokenFilePath: "/uploads/bill-1.pdf",
    });
    assert.deepEqual(res, { ok: true });
  });
});
