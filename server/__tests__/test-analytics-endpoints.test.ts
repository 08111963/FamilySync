/**
 * Test d'integrazione endpoint analytics di test.
 * Monta i router reali su un'app Express locale con autenticazione stub
 * (utente demo reale dal DB). Esegui con:
 *   npx tsx server/__tests__/test-analytics-endpoints.test.ts
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server } from "node:http";

process.env.ENABLE_TEST_ANALYTICS = "true";
process.env.APP_OWNER_EMAILS = "owner@test.dev";

import {
  testAnalyticsEventsRouter,
  testAnalyticsAdminRouter,
  requireTestAnalyticsFlag,
} from "../routes/test-analytics";
import { db } from "../db";
import { testAnalyticsEvents, users } from "../../shared/schema";
import { eq } from "drizzle-orm";

const MARKER = "__endpoint_selftest__";

let server: Server;
let base = "";
let demoUser: { id: string; email: string };

// Auth stub: legge l'utente da header di test (nessun JWT necessario qui;
// il middleware authenticate reale è già coperto dagli altri flussi API).
function stubAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).user = { userId: demoUser.id, email: demoUser.email };
  next();
}

before(async () => {
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, "demo@familysync.eu")).limit(1);
  assert.ok(u, "utente demo richiesto nel DB dev");
  demoUser = u;

  const app = express();
  app.use(express.json());
  app.use("/api/test-analytics", requireTestAnalyticsFlag, stubAuth, testAnalyticsEventsRouter);
  app.use("/api/admin/test-analytics", requireTestAnalyticsFlag, stubAuth, testAnalyticsAdminRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

async function countMarker(): Promise<number> {
  const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.screen, MARKER));
  return rows.length;
}

describe("flag off => 404 e nessun salvataggio", () => {
  test("POST /events e admin rispondono 404 senza salvare", async () => {
    process.env.ENABLE_TEST_ANALYTICS = "false";
    const beforeN = await countMarker();
    const r1 = await fetch(`${base}/api/test-analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "screen_view", screen: MARKER }),
    });
    const r2 = await fetch(`${base}/api/admin/test-analytics/access`);
    assert.equal(r1.status, 404);
    assert.equal(r2.status, 404);
    assert.equal(await countMarker(), beforeN);
    process.env.ENABLE_TEST_ANALYTICS = "true";
  });
});

describe("ingest eventi", () => {
  test("evento valido -> 201 e salvato; demo marcato", async () => {
    const r = await fetch(`${base}/api/test-analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "screen_view", screen: MARKER, platform: "web", metadata: { feature: "ok", private: "NO" } }),
    });
    assert.equal(r.status, 201);
    const rows = await db.select().from(testAnalyticsEvents).where(eq(testAnalyticsEvents.screen, MARKER));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isDemoAccount, true);
    assert.deepEqual(rows[0].metadata, { feature: "ok" });
  });
  test("evento non in allowlist -> 400, non salvato", async () => {
    const r = await fetch(`${base}/api/test-analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "evil_event", screen: MARKER }),
    });
    assert.equal(r.status, 400);
    assert.equal(await countMarker(), 1);
  });
});

describe("pannello admin: autorizzazione", () => {
  test("non-owner (demo non in allowlist) -> 403", async () => {
    process.env.APP_OWNER_EMAILS = "owner@test.dev";
    const r = await fetch(`${base}/api/admin/test-analytics/access`);
    assert.equal(r.status, 403);
  });
  test("owner (demo in allowlist + email verificata) -> 200 e summary/delete funzionano", async () => {
    process.env.APP_OWNER_EMAILS = `owner@test.dev, ${demoUser.email}`;
    const access = await fetch(`${base}/api/admin/test-analytics/access`);
    assert.equal(access.status, 200);
    assert.deepEqual(await access.json(), { allowed: true });

    const summary = await fetch(`${base}/api/admin/test-analytics/summary?period=7d`);
    assert.equal(summary.status, 200);
    const s = await summary.json() as any;
    assert.equal(typeof s.totalEvents, "number");
    assert.ok(Array.isArray(s.topScreens));
    assert.ok(s.totalEvents >= 1);

    const del = await fetch(`${base}/api/admin/test-analytics`, { method: "DELETE" });
    assert.equal(del.status, 200);
    const count = await db.select().from(testAnalyticsEvents);
    assert.equal(count.length, 0);
  });
});

after(async () => {
  await db.delete(testAnalyticsEvents).where(eq(testAnalyticsEvents.screen, MARKER));
  server?.close();
  process.exit(0);
});
