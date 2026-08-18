/**
 * Test analytics interna TEMPORANEA.
 * Esegui con: npx tsx server/__tests__/test-analytics.test.ts
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

process.env.ENABLE_TEST_ANALYTICS = process.env.ENABLE_TEST_ANALYTICS || "true";
process.env.APP_OWNER_EMAILS = "owner@test.dev, Secondo@Test.dev";

import {
  trackServerEvent,
  isAppOwner,
  isTestAnalyticsEnabled,
  sanitizeMetadata,
  sanitizePlatform,
  pruneOldEvents,
  ALLOWED_EVENTS,
  RETENTION_DAYS,
} from "../lib/test-analytics";
import { db } from "../db";
import { testAnalyticsEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";

describe("feature flag", () => {
  test("flag true -> abilitata", () => {
    process.env.ENABLE_TEST_ANALYTICS = "true";
    assert.equal(isTestAnalyticsEnabled(), true);
  });
  test("flag false/assente -> disabilitata", () => {
    process.env.ENABLE_TEST_ANALYTICS = "false";
    assert.equal(isTestAnalyticsEnabled(), false);
    delete process.env.ENABLE_TEST_ANALYTICS;
    assert.equal(isTestAnalyticsEnabled(), false);
    process.env.ENABLE_TEST_ANALYTICS = "true";
  });
});

describe("allowlist proprietario app", () => {
  test("email in allowlist -> ok (case-insensitive, trim)", () => {
    assert.equal(isAppOwner("owner@test.dev"), true);
    assert.equal(isAppOwner("OWNER@TEST.DEV"), true);
    assert.equal(isAppOwner(" secondo@test.dev "), true);
  });
  test("email NON in allowlist -> negato", () => {
    assert.equal(isAppOwner("altro@test.dev"), false);
    assert.equal(isAppOwner(""), false);
    assert.equal(isAppOwner(null), false);
  });
});

describe("sanitizzazione metadata (niente contenuti personali)", () => {
  test("chiavi non in whitelist vengono scartate", () => {
    const out = sanitizeMetadata({
      feature: "recipe_to_shopping_list",
      messageText: "testo privato chat",
      billTitle: "Bolletta luce",
      amount: "150 euro",
      prompt: "prompt AI",
      email: "user@example.com",
    });
    assert.deepEqual(Object.keys(out), ["feature"]);
  });
  test("valori stringa troncati a 100 caratteri, solo scalari", () => {
    const out = sanitizeMetadata({ route: "x".repeat(500), status: 500, enabled: true, code: { nested: 1 } });
    assert.equal((out.route as string).length, 100);
    assert.equal(out.status, 500);
    assert.equal(out.enabled, true);
    assert.equal("code" in out, false);
  });
  test("input non-oggetto -> {}", () => {
    assert.deepEqual(sanitizeMetadata("str"), {});
    assert.deepEqual(sanitizeMetadata([1, 2]), {});
    assert.deepEqual(sanitizeMetadata(null), {});
  });
});

describe("piattaforma ed eventi", () => {
  test("solo web/android/ios", () => {
    assert.equal(sanitizePlatform("web"), "web");
    assert.equal(sanitizePlatform("IOS"), "ios");
    assert.equal(sanitizePlatform("windows"), null);
    assert.equal(sanitizePlatform(42), null);
  });
  test("allowlist eventi tecnici", () => {
    assert.equal(ALLOWED_EVENTS.has("screen_view"), true);
    assert.equal(ALLOWED_EVENTS.has("chat_message_content"), false);
  });
  test("retention 30 giorni", () => {
    assert.equal(RETENTION_DAYS, 30);
  });
});

// ---------------------------------------------------------------------------
// Test integrazione DB (retention) — usa il DB di sviluppo
// ---------------------------------------------------------------------------
const MARKER_SCREEN = "__test_analytics_selftest__";

describe("retention/pulizia su DB", () => {
  test("pruneOldEvents elimina solo eventi > 30 giorni", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.insert(testAnalyticsEvents).values([
      { eventName: "app_open", screen: MARKER_SCREEN, createdAt: old },
      { eventName: "app_open", screen: MARKER_SCREEN },
    ]);
    await pruneOldEvents();
    const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.screen, MARKER_SCREEN));
    assert.equal(rows.length, 1);
    assert.ok(rows[0].createdAt.getTime() > Date.now() - 24 * 60 * 60 * 1000);
  });
});

after(async () => {
  await db.delete(testAnalyticsEvents).where(eq(testAnalyticsEvents.screen, MARKER_SCREEN));
  process.exit(0);
});

describe("trackServerEvent (funnel lato server)", () => {
  const FAM = "00000000-0000-4000-8000-00000000f0f0";
  after(async () => {
    await db.delete(testAnalyticsEvents).where(eq(testAnalyticsEvents.familyId, FAM));
  });

  test("flag spento -> nessun evento salvato", async () => {
    process.env.ENABLE_TEST_ANALYTICS = "false";
    await trackServerEvent("first_chore_assigned", { familyId: FAM, oncePerFamily: true });
    process.env.ENABLE_TEST_ANALYTICS = "true";
    const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.familyId, FAM));
    assert.equal(rows.length, 0);
  });

  test("evento non in whitelist -> rifiutato in silenzio", async () => {
    await trackServerEvent("evento_inventato", { familyId: FAM });
    const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.familyId, FAM));
    assert.equal(rows.length, 0);
  });

  test("oncePerFamily -> nessun duplicato first_*", async () => {
    await trackServerEvent("first_chore_assigned", { familyId: FAM, oncePerFamily: true });
    await trackServerEvent("first_chore_assigned", { familyId: FAM, oncePerFamily: true });
    const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.familyId, FAM));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].eventName, "first_chore_assigned");
  });
});
