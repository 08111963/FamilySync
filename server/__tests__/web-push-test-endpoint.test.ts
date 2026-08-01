/**
 * Test d'integrazione endpoint notifica di prova web push (owner-gated).
 * Monta il router reale su un'app Express locale con autenticazione stub
 * (utente demo reale dal DB). Esegui con:
 *   npx tsx server/__tests__/web-push-test-endpoint.test.ts
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server } from "node:http";

process.env.APP_OWNER_EMAILS = "owner@test.dev";

import notificationsRouter from "../routes/notifications";
import { db } from "../db";
import { users, webPushSubscriptions } from "../../shared/schema";
import { eq } from "drizzle-orm";

const MARKER_ENDPOINT = "https://fcm.googleapis.com/fcm/send/__webpush_selftest__";

let server: Server;
let base = "";
let demoUser: { id: string; email: string };

function stubAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).user = { userId: demoUser.id, email: demoUser.email };
  next();
}

before(async () => {
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, "demo@familysync.eu"))
    .limit(1);
  assert.ok(u, "utente demo richiesto nel DB dev");
  demoUser = u;

  const app = express();
  app.use(express.json());
  app.use("/api/notifications", stubAuth, notificationsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

describe("gating proprietario", () => {
  test("non-owner -> 404 su /access e /test", async () => {
    process.env.APP_OWNER_EMAILS = "owner@test.dev";
    const r1 = await fetch(`${base}/api/notifications/web/test/access`);
    const r2 = await fetch(`${base}/api/notifications/web/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: MARKER_ENDPOINT }),
    });
    assert.equal(r1.status, 404);
    assert.equal(r2.status, 404);
  });

  test("owner -> 200 su /access", async () => {
    process.env.APP_OWNER_EMAILS = `owner@test.dev, ${demoUser.email}`;
    const r = await fetch(`${base}/api/notifications/web/test/access`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });
});

describe("verifica proprietà sottoscrizione", () => {
  test("endpoint non registrato per l'utente -> 404 SUBSCRIPTION_NOT_FOUND", async () => {
    process.env.APP_OWNER_EMAILS = `owner@test.dev, ${demoUser.email}`;
    const r = await fetch(`${base}/api/notifications/web/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: MARKER_ENDPOINT }),
    });
    assert.equal(r.status, 404);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, "SUBSCRIPTION_NOT_FOUND");
  });

  test("body non valido -> 400", async () => {
    const r = await fetch(`${base}/api/notifications/web/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });

  test("endpoint registrato -> l'invio parte (fallisce col servizio push, mai 404)", async () => {
    // Sottoscrizione fasulla ma appartenente all'utente: il push service la
    // rifiuterà (410 -> rimossa, oppure 502), ma NON deve essere 404 di gating.
    await db
      .insert(webPushSubscriptions)
      .values({ userId: demoUser.id, endpoint: MARKER_ENDPOINT, p256dh: "BPtestp256dh", auth: "testauth" })
      .onConflictDoNothing();
    const r = await fetch(`${base}/api/notifications/web/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: MARKER_ENDPOINT }),
    });
    assert.ok([410, 502, 503, 500].includes(r.status), `status inatteso: ${r.status}`);
  });

  test("rate limit dedicato -> 429 dopo 5 richieste/minuto", async () => {
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${base}/api/notifications/web/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: MARKER_ENDPOINT }),
      });
      if (r.status === 429) got429 = true;
    }
    assert.ok(got429, "atteso 429 dal rate limiter dedicato");
  });
});

after(async () => {
  await db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.endpoint, MARKER_ENDPOINT));
  server?.close();
  process.exit(0);
});
