import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, calendarEvents } from "../../shared/schema";
import { createEventSchema, updateEventSchema, sendEventValidationError } from "../routes/calendar";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test della validazione orari eventi calendario (task "orari malformati"):
 * - schemi Zod: orari recuperabili normalizzati, irrecuperabili rifiutati;
 * - risposta HTTP 422 con codice esplicito INVALID_TIME_FORMAT;
 * - constraint CHECK a livello DB (migrazione 0026).
 */

describe("schemi Zod eventi: campo time", () => {
  test("orario canonico e recuperabile vengono accettati/normalizzati", () => {
    const ok = createEventSchema.safeParse({ title: "x", date: "2026-01-01", time: "09:30" });
    assert.equal(ok.success, true);
    const norm = createEventSchema.safeParse({ title: "x", date: "2026-01-01", time: "15", endTime: "15.45" });
    assert.equal(norm.success, true);
    if (norm.success) {
      assert.equal(norm.data.time, "15:00");
      assert.equal(norm.data.endTime, "15:45");
    }
  });

  test("orario irrecuperabile viene rifiutato (create e update)", () => {
    for (const bad of ["99:99", "boh", "25:00", "12:75"]) {
      const c = createEventSchema.safeParse({ title: "x", date: "2026-01-01", time: bad });
      assert.equal(c.success, false, `create doveva rifiutare "${bad}"`);
      const u = updateEventSchema.safeParse({ time: bad });
      assert.equal(u.success, false, `update doveva rifiutare "${bad}"`);
    }
  });
});

describe("sendEventValidationError: 422 esplicito sugli orari", () => {
  function fakeRes() {
    const out = { statusCode: 0, body: undefined as any };
    return {
      out,
      res: {
        status(code: number) { out.statusCode = code; return this; },
        json(payload: unknown) { out.body = payload; return this; },
      } as any,
    };
  }

  test("errore su time → 422 INVALID_TIME_FORMAT", () => {
    const parsed = createEventSchema.safeParse({ title: "x", date: "2026-01-01", time: "boh" });
    assert.equal(parsed.success, false);
    const { res, out } = fakeRes();
    if (!parsed.success) sendEventValidationError(res, parsed.error);
    assert.equal(out.statusCode, 422);
    assert.equal(out.body.error.code, "INVALID_TIME_FORMAT");
  });

  test("altri errori di validazione restano 400 VALIDATION_ERROR", () => {
    const parsed = createEventSchema.safeParse({ title: "", date: "2026-01-01" });
    assert.equal(parsed.success, false);
    const { res, out } = fakeRes();
    if (!parsed.success) sendEventValidationError(res, parsed.error);
    assert.equal(out.statusCode, 400);
    assert.equal(out.body.error.code, "VALIDATION_ERROR");
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe("integrazione DB + HTTP", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  let token: string;
  let familyId: string;
  let userId: string;
  const created = { users: [] as string[], families: [] as string[] };
  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    Object.assign(process.env, { NODE_ENV: "test" });

    const [u] = await db.insert(users).values({
      email: `time-validation-${uniq()}@test.local`,
      name: "Time Test",
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    userId = u.id;
    created.users.push(u.id);
    const [f] = await db.insert(families).values({ name: `time-test-${uniq()}` }).returning();
    familyId = f.id;
    created.families.push(f.id);
    await db.insert(familyMembers).values({ familyId, userId, role: "admin", color: "#6366F1" });
    token = generateAccessToken(u as any);

    const app = express();
    app.use(express.json());
    registerRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  after(async () => {
    server?.close();
    if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
    if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  });

  function request(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  test("POST con orario invalido → 422 INVALID_TIME_FORMAT", async () => {
    const res = await request("POST", `/api/calendar/${familyId}`, {
      title: "Evento", date: "2026-01-01", time: "99:99",
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "INVALID_TIME_FORMAT");
  });

  test("PUT con orario invalido → 422 INVALID_TIME_FORMAT", async () => {
    const createRes = await request("POST", `/api/calendar/${familyId}`, {
      title: "Evento", date: "2026-01-01", time: "09:00",
    });
    assert.equal(createRes.status, 201);
    const event = await createRes.json();
    const res = await request("PUT", `/api/calendar/${familyId}/${event.id}`, { time: "12:75" });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "INVALID_TIME_FORMAT");
  });

  test("constraint CHECK: insert diretto con time malformato viene rifiutato dal DB", async () => {
    await assert.rejects(
      db.insert(calendarEvents).values({
        familyId,
        title: "Malformato",
        date: "2026-01-01",
        time: "15" as any,
        color: "#000000",
        createdBy: userId,
      }),
      /calendar_events_time_format_check/
    );
    await assert.rejects(
      db.insert(calendarEvents).values({
        familyId,
        title: "Malformato",
        date: "2026-01-01",
        time: "15:00",
        endTime: "16" as any,
        color: "#000000",
        createdBy: userId,
      }),
      /calendar_events_end_time_format_check/
    );
  });
});
