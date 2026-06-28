import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isEntitlementActive,
  deriveStatus,
  syncEntitlementFromRevenueCat,
  isPremium,
  getPlanForFamily,
  __setEntitlementStoreForTest,
  __resetEntitlementStoreForTest,
  type EntitlementStore,
  type ApplyPurchaseInput,
  type EntitlementRecord,
} from "../lib/entitlements";

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

afterEach(() => {
  __resetEntitlementStoreForTest();
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

describe("deriveStatus (sync RevenueCat)", () => {
  test("non attivo -> expired", () => {
    assert.equal(deriveStatus({ active: false, expiresAt: null }), "expired");
  });
  test("attivo ma scaduto -> expired", () => {
    assert.equal(deriveStatus({ active: true, expiresAt: new Date(Date.now() - 1000) }), "expired");
  });
  test("attivo senza scadenza -> active", () => {
    assert.equal(deriveStatus({ active: true, expiresAt: null }), "active");
  });
  test("attivo e non scaduto -> active", () => {
    assert.equal(deriveStatus({ active: true, expiresAt: new Date(Date.now() + 1000) }), "active");
  });
});

describe("syncEntitlementFromRevenueCat + isPremium + getPlanForFamily", () => {
  test("entitlement attivo -> premium true, subStatus premium, piano premium", async () => {
    const { store, state } = makeMemoryEntitlementStore();
    __setEntitlementStoreForTest(store);
    const res = await syncEntitlementFromRevenueCat({
      familyId: "fam-1",
      userId: "u1",
      active: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    assert.equal(res.premium, true);
    assert.equal(res.status, "active");
    assert.equal(state.subStatus, "premium");
    assert.equal(state.upserts[0].platform, "revenuecat");
    assert.equal(await isPremium("fam-1"), true);
    assert.equal(await getPlanForFamily("fam-1"), "premium");
  });

  test("entitlement non attivo -> premium false, subStatus free, piano free", async () => {
    const { store, state } = makeMemoryEntitlementStore();
    __setEntitlementStoreForTest(store);
    const res = await syncEntitlementFromRevenueCat({
      familyId: "fam-2",
      userId: "u1",
      active: false,
      expiresAt: new Date(Date.now() - 1000),
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
