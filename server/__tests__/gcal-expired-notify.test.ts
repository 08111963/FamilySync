import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

import { db } from "../db";
import { users, googleCalendarConnections } from "../../shared/schema";
import { encryptToken, markConnectionExpired } from "../lib/google-calendar-sync";

/**
 * Test di INTEGRAZIONE contro il DB reale: verifica che la transizione
 * active→expired del collegamento Google Calendar notifichi l'utente UNA sola
 * volta (dedup atomico nell'UPDATE). Le email non partono davvero:
 * RESEND_API_KEY viene svuotata (isEmailConfigured false ⇒ solo log dev) e
 * l'utente non ha token push registrati. La notifica viene osservata contando
 * i log dev dell'email.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("gcal expired notify (DB)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let userId: string;
  const savedResendKey = process.env.RESEND_API_KEY;
  const origLog = console.log;
  let emailDevLogs = 0;

  before(async () => {
    delete process.env.RESEND_API_KEY;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("Collegamento Google Calendar scaduto")) {
        emailDevLogs += 1;
      }
      origLog(...args);
    };
    const [u] = await db
      .insert(users)
      .values({
        email: `gcal-expired-test-${Date.now()}@example.com`,
        name: "Gcal Test",
        passwordHash: "x",
        emailVerified: true,
      })
      .returning({ id: users.id });
    userId = u.id;
    await db.insert(googleCalendarConnections).values({
      userId,
      googleEmail: "test@gmail.com",
      refreshTokenEnc: encryptToken("dummy-refresh"),
      status: "active",
    });
  });

  after(async () => {
    console.log = origLog;
    if (savedResendKey) process.env.RESEND_API_KEY = savedResendKey;
    if (userId) {
      await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  test("prima transizione active→expired: stato aggiornato e UNA notifica", async () => {
    await markConnectionExpired(userId, "Accesso revocato o scaduto: ricollega Google Calendar.");
    const [conn] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId));
    assert.equal(conn.status, "expired");
    assert.match(conn.lastError ?? "", /ricollega/i);
    assert.equal(emailDevLogs, 1);
  });

  test("seconda chiamata (già expired): aggiorna il motivo ma NON rinotifica", async () => {
    await markConnectionExpired(userId, "Autorizzazione Google non più valida: ricollega il calendario.");
    const [conn] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId));
    assert.equal(conn.status, "expired");
    assert.match(conn.lastError ?? "", /Autorizzazione/);
    assert.equal(emailDevLogs, 1, "nessuna seconda notifica per lo stesso collegamento scaduto");
  });

  test("chiamate concorrenti su collegamento riattivato: una sola notifica", async () => {
    await db
      .update(googleCalendarConnections)
      .set({ status: "active", lastError: null })
      .where(eq(googleCalendarConnections.userId, userId));
    const baseline = emailDevLogs;
    await Promise.all([
      markConnectionExpired(userId, "revoca A"),
      markConnectionExpired(userId, "revoca B"),
      markConnectionExpired(userId, "revoca C"),
    ]);
    assert.equal(emailDevLogs - baseline, 1, "dedup atomico anche con chiamate concorrenti");
  });
});
