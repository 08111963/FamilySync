/**
 * Test d'integrazione endpoint notifica di prova push nativa (owner-gated).
 * Monta il router reale su un'app Express locale con autenticazione stub
 * (utente demo reale dal DB). Esegui con:
 *   npx tsx server/__tests__/native-push-test-endpoint.test.ts
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Server } from "node:http";

process.env.APP_OWNER_EMAILS = "owner@test.dev";

import notificationsRouter from "../routes/notifications";
import { db } from "../db";
import { users, pushTokens } from "../../shared/schema";
import { eq } from "drizzle-orm";

const MARKER_TOKEN = "ExponentPushToken[__native_selftest__]";
const INVALID_FORMAT_TOKEN = "not-an-expo-token-__native_selftest__";

let server: Server;
let base = "";
let demoUser: { id: string; email: string };

function stubAuth(req: Request, _res: Response, next: NextFunction) {
  (req as any).user = { userId: demoUser.id, email: demoUser.email };
  next();
}

async function postTest(token: unknown) {
  return fetch(`${base}/api/notifications/native/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token === undefined ? {} : { token }),
  });
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
  test("non-owner -> 404 su /native/test", async () => {
    process.env.APP_OWNER_EMAILS = "owner@test.dev";
    const r = await postTest(MARKER_TOKEN);
    assert.equal(r.status, 404);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, "NOT_FOUND");
  });
});

describe("verifica proprietà token", () => {
  test("token non registrato per l'utente -> 404 TOKEN_NOT_FOUND", async () => {
    process.env.APP_OWNER_EMAILS = `owner@test.dev, ${demoUser.email}`;
    const r = await postTest(MARKER_TOKEN);
    assert.equal(r.status, 404);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, "TOKEN_NOT_FOUND");
  });

  test("body non valido -> 400", async () => {
    const r = await postTest(undefined);
    assert.equal(r.status, 400);
  });

  test("token registrato ma formato non Expo -> 400 INVALID_TOKEN", async () => {
    await db
      .insert(pushTokens)
      .values({ userId: demoUser.id, token: INVALID_FORMAT_TOKEN, platform: "android" })
      .onConflictDoNothing();
    const r = await postTest(INVALID_FORMAT_TOKEN);
    assert.equal(r.status, 400);
    const body = (await r.json()) as any;
    assert.equal(body.error.code, "INVALID_TOKEN");
  });

  test("token registrato -> l'invio parte (fallisce col servizio push, mai 404)", async () => {
    // Token fasullo ma appartenente all'utente: exp.host lo rifiuterà
    // (ticket error -> 502, oppure DeviceNotRegistered -> 410), ma NON deve
    // essere 404 di gating né di proprietà.
    await db
      .insert(pushTokens)
      .values({ userId: demoUser.id, token: MARKER_TOKEN, platform: "android" })
      .onConflictDoNothing();
    const r = await postTest(MARKER_TOKEN);
    assert.ok([410, 502, 500].includes(r.status), `status inatteso: ${r.status}`);
  });

  test("rate limit dedicato -> 429 entro 6 richieste/minuto", async () => {
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const r = await postTest(MARKER_TOKEN);
      if (r.status === 429) got429 = true;
    }
    assert.ok(got429, "atteso 429 dal rate limiter dedicato");
  });
});

after(async () => {
  await db.delete(pushTokens).where(eq(pushTokens.token, MARKER_TOKEN));
  await db.delete(pushTokens).where(eq(pushTokens.token, INVALID_FORMAT_TOKEN));
  server?.close();
  process.exit(0);
});
