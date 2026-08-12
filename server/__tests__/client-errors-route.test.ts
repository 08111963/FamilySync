/**
 * Test della rotta pubblica POST /api/client-errors: il 204 deve essere
 * emesso SOLO DOPO il tentativo di persistenza del report (altrimenti un
 * riavvio subito dopo la risposta perderebbe il crash appena arrivato).
 * Run: npx tsx server/__tests__/client-errors-route.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";

delete process.env.APP_OWNER_EMAILS;
process.env.CLIENT_CRASH_ALERT_THRESHOLD = "3";
process.env.CLIENT_CRASH_ALERT_WINDOW_MINUTES = "15";
process.env.CLIENT_CRASH_ALERT_COOLDOWN_MINUTES = "60";

import clientErrorsRouter from "../routes/client-errors";
import { resetClientCrashAlertState } from "../lib/client-crash-alert";
import { db } from "../db";
import { clientCrashReports } from "../../shared/schema";

test("il 204 arriva solo dopo che il report è persistito su DB", async () => {
  await resetClientCrashAlertState();

  const app = express();
  app.use(express.json());
  app.use("/api/client-errors", clientErrorsRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "ResizeObserver is not defined",
        url: "https://familysync.eu/join-link/tok123abc",
        platform: "web",
      }),
    });
    assert.equal(res.status, 204);

    // Nel momento in cui il client riceve il 204, la riga DEVE già esserci:
    // nessuna race con un eventuale shutdown subito dopo la risposta.
    const rows = await db.select().from(clientCrashReports);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].message, "ResizeObserver is not defined");
    // Il token nel path è stato mascherato prima della persistenza.
    assert.ok(!rows[0].url?.includes("tok123abc"));
  } finally {
    server.close();
    await resetClientCrashAlertState();
  }
});

test("report non valido: 400 senza persistenza", async () => {
  await resetClientCrashAlertState();

  const app = express();
  app.use(express.json());
  app.use("/api/client-errors", clientErrorsRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    assert.equal(res.status, 400);
    const rows = await db.select().from(clientCrashReports);
    assert.equal(rows.length, 0);
  } finally {
    server.close();
    await resetClientCrashAlertState();
  }
});
