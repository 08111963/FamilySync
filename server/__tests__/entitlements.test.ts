import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isEntitlementActive,
  deriveStatus,
  applyPurchase,
  isPremium,
  getPlanForFamily,
  __setEntitlementStoreForTest,
  __resetEntitlementStoreForTest,
  type EntitlementStore,
  type ApplyPurchaseInput,
  type EntitlementRecord,
} from "../lib/entitlements";
import {
  verifyPurchase,
  __setIapVerifierForTest,
  __resetIapVerifierForTest,
  PurchaseVerificationError,
  isPurchaseVerificationError,
  type IapVerifier,
  type VerifyOutcome,
} from "../lib/iap-verifier";

function makeMemoryEntitlementStore() {
  const state: { record: EntitlementRecord | null; upserts: ApplyPurchaseInput[]; subStatus: string | null } = {
    record: null,
    upserts: [],
    subStatus: null,
  };
  const store: EntitlementStore = {
    async get() {
      return state.record;
    },
    async upsert(input) {
      state.upserts.push(input);
      state.record = { status: input.status, expiresAt: input.expiresAt };
    },
    async setFamilySubscriptionStatus(_familyId, status) {
      state.subStatus = status;
    },
  };
  return { store, state };
}

function outcome(partial: Partial<VerifyOutcome>): VerifyOutcome {
  return {
    valid: true,
    productId: "familysync_premium",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    canceled: false,
    originalTransactionId: null,
    transactionId: null,
    rawReceipt: "receipt",
    ...partial,
  };
}

afterEach(() => {
  __resetEntitlementStoreForTest();
  __resetIapVerifierForTest();
});

describe("isEntitlementActive", () => {
  test("null -> false", () => {
    assert.equal(isEntitlementActive(null), false);
  });
  test("active senza scadenza -> true", () => {
    assert.equal(isEntitlementActive({ status: "active", expiresAt: null }), true);
  });
  test("active ma scaduto -> false", () => {
    assert.equal(isEntitlementActive({ status: "active", expiresAt: new Date(Date.now() - 1000) }), false);
  });
  test("active futuro -> true", () => {
    assert.equal(isEntitlementActive({ status: "active", expiresAt: new Date(Date.now() + 1000) }), true);
  });
  test("status non active -> false", () => {
    assert.equal(isEntitlementActive({ status: "expired", expiresAt: new Date(Date.now() + 1000) }), false);
  });
});

describe("deriveStatus", () => {
  test("canceled -> canceled", () => {
    assert.equal(deriveStatus(outcome({ canceled: true })), "canceled");
  });
  test("non valido -> expired", () => {
    assert.equal(deriveStatus(outcome({ valid: false })), "expired");
  });
  test("scaduto -> expired", () => {
    assert.equal(deriveStatus(outcome({ valid: true, expiresAt: new Date(Date.now() - 1000) })), "expired");
  });
  test("valido e non scaduto -> active", () => {
    assert.equal(deriveStatus(outcome({})), "active");
  });
});

describe("applyPurchase + isPremium + getPlanForFamily", () => {
  test("acquisto valido -> premium true, subStatus premium, piano premium", async () => {
    const { store, state } = makeMemoryEntitlementStore();
    __setEntitlementStoreForTest(store);
    const res = await applyPurchase({
      familyId: "fam-1",
      userId: "u1",
      platform: "google",
      outcome: outcome({}),
    });
    assert.equal(res.premium, true);
    assert.equal(res.status, "active");
    assert.equal(state.subStatus, "premium");
    assert.equal(await isPremium("fam-1"), true);
    assert.equal(await getPlanForFamily("fam-1"), "premium");
  });

  test("acquisto scaduto -> premium false, subStatus free, piano free", async () => {
    const { store, state } = makeMemoryEntitlementStore();
    __setEntitlementStoreForTest(store);
    const res = await applyPurchase({
      familyId: "fam-2",
      userId: "u1",
      platform: "apple",
      outcome: outcome({ valid: false, expiresAt: new Date(Date.now() - 1000) }),
    });
    assert.equal(res.premium, false);
    assert.equal(state.subStatus, "free");
    assert.equal(await isPremium("fam-2"), false);
    assert.equal(await getPlanForFamily("fam-2"), "free");
  });

  test("isPremium fail-closed: store che lancia -> false", async () => {
    __setEntitlementStoreForTest({
      async get() { throw new Error("db down"); },
      async upsert() {},
      async setFamilySubscriptionStatus() {},
    });
    assert.equal(await isPremium("fam-x"), false);
  });
});

describe("verifyPurchase (verifier iniettabile)", () => {
  test("instrada al verifier iniettato e ritorna l'esito", async () => {
    const fake: IapVerifier = {
      async verify(input) {
        return outcome({ productId: input.productId });
      },
    };
    __setIapVerifierForTest(fake);
    const res = await verifyPurchase({ platform: "google", productId: "familysync_premium", purchaseToken: "tok" });
    assert.equal(res.valid, true);
    assert.equal(res.productId, "familysync_premium");
  });

  test("verifier che lancia PurchaseVerificationError viene propagato", async () => {
    __setIapVerifierForTest({
      async verify() {
        throw new PurchaseVerificationError("PURCHASE_INVALID", "test");
      },
    });
    await assert.rejects(
      verifyPurchase({ platform: "apple", productId: "p", receiptData: "r" }),
      (e: unknown) => isPurchaseVerificationError(e) && (e as PurchaseVerificationError).httpStatus === 400,
    );
  });
});

describe("PurchaseVerificationError", () => {
  test("mappa codice -> http status corretto", () => {
    assert.equal(new PurchaseVerificationError("PURCHASE_VERIFICATION_UNAVAILABLE").httpStatus, 503);
    assert.equal(new PurchaseVerificationError("PURCHASE_INVALID").httpStatus, 400);
    assert.equal(new PurchaseVerificationError("PURCHASE_VERIFICATION_FAILED").httpStatus, 502);
  });
});
