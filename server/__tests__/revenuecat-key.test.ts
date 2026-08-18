import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectRevenueCatApiKey } from "../../lib/revenuecat-key";

/**
 * Mandato monetizzazione — punto 5: la selezione della API key RevenueCat
 * deve richiedere SOLO la chiave del contesto corrente, con fail-fast chiaro
 * se manca proprio quella necessaria.
 */
describe("selectRevenueCatApiKey", () => {
  test("modalità test usa la TEST key anche senza chiavi store", () => {
    assert.equal(
      selectRevenueCatApiKey({ testMode: true, platform: "android", testKey: "tk" }),
      "tk",
    );
  });

  test("web usa la TEST key anche fuori dal test mode", () => {
    assert.equal(
      selectRevenueCatApiKey({ testMode: false, platform: "web", testKey: "tk" }),
      "tk",
    );
  });

  test("Android reale usa la ANDROID key anche senza iOS/test key", () => {
    assert.equal(
      selectRevenueCatApiKey({ testMode: false, platform: "android", androidKey: "ak" }),
      "ak",
    );
  });

  test("iOS reale usa la IOS key anche senza Android/test key", () => {
    assert.equal(
      selectRevenueCatApiKey({ testMode: false, platform: "ios", iosKey: "ik" }),
      "ik",
    );
  });

  test("fail-fast chiaro se manca la chiave del contesto", () => {
    assert.throws(
      () => selectRevenueCatApiKey({ testMode: false, platform: "android", testKey: "tk", iosKey: "ik" }),
      /ANDROID/,
    );
    assert.throws(
      () => selectRevenueCatApiKey({ testMode: false, platform: "ios", testKey: "tk", androidKey: "ak" }),
      /IOS/,
    );
    assert.throws(
      () => selectRevenueCatApiKey({ testMode: true, platform: "ios", iosKey: "ik", androidKey: "ak" }),
      /TEST/,
    );
  });
});
