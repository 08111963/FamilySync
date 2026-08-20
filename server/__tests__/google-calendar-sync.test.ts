import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import express from "express";
import type { Server } from "node:http";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "test-client-secret";

import {
  encryptToken,
  decryptToken,
  signGcalOauthState,
  verifyGcalOauthState,
  eventToGooglePayload,
  syncCreatedEvents,
  syncUpdatedEvent,
  syncDeletedEvents,
  getLinksForEvents,
  backfillUserCalendar,
  removeBlockedEventLinks,
  googleEventIdForFamilySyncEvent,
} from "../lib/google-calendar-sync";
import type { CalendarEvent } from "../../shared/schema";
import billsRouter from "../routes/bills";

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    familyId: "22222222-2222-2222-2222-222222222222",
    title: "Cena",
    description: null,
    date: "2026-08-10",
    time: null,
    endTime: null,
    allDay: false,
    category: "family",
    location: null,
    color: "#6366F1",
    memberId: null,
    recurrenceRule: null,
    seriesId: null,
    createdBy: "33333333-3333-3333-3333-333333333333",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  } as CalendarEvent;
}

describe("token encryption", () => {
  test("roundtrip", () => {
    const enc = encryptToken("1//refresh-token-example");
    assert.notEqual(enc, "1//refresh-token-example");
    assert.equal(decryptToken(enc), "1//refresh-token-example");
  });

  test("tampered ciphertext rejected", () => {
    const enc = encryptToken("secret");
    const parts = enc.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${Buffer.from("XXXXXXXX").toString("base64")}`;
    assert.throws(() => decryptToken(tampered));
  });
});

describe("oauth state", () => {
  test("roundtrip", () => {
    const state = signGcalOauthState("user-1", "https://familysync.eu/calendar-sync");
    const out = verifyGcalOauthState(state);
    assert.equal(out.userId, "user-1");
    assert.equal(out.returnUrl, "https://familysync.eu/calendar-sync");
  });

  test("garbage rejected", () => {
    assert.throws(() => verifyGcalOauthState("not-a-jwt"));
  });
});

describe("eventToGooglePayload", () => {
  test("all-day event uses date start/end (end exclusive next day)", () => {
    const p = eventToGooglePayload(makeEvent({ allDay: true })) as any;
    assert.deepEqual(p.start, { date: "2026-08-10" });
    assert.deepEqual(p.end, { date: "2026-08-11" });
    assert.equal(p.summary, "Cena");
    assert.equal(p.extendedProperties.private.familySyncEventId, "11111111-1111-1111-1111-111111111111");
  });

  test("event without time treated as all-day", () => {
    const p = eventToGooglePayload(makeEvent({ allDay: false, time: null })) as any;
    assert.deepEqual(p.start, { date: "2026-08-10" });
  });

  test("timed event with endTime", () => {
    const p = eventToGooglePayload(makeEvent({ time: "18:30", endTime: "20:00" })) as any;
    assert.deepEqual(p.start, { dateTime: "2026-08-10T18:30:00", timeZone: "Europe/Rome" });
    assert.deepEqual(p.end, { dateTime: "2026-08-10T20:00:00", timeZone: "Europe/Rome" });
  });

  test("timed event without endTime defaults to +1h", () => {
    const p = eventToGooglePayload(makeEvent({ time: "09:15" })) as any;
    assert.deepEqual(p.end, { dateTime: "2026-08-10T10:15:00", timeZone: "Europe/Rome" });
  });

  test("end past midnight rolls to next day", () => {
    const p = eventToGooglePayload(makeEvent({ time: "23:30" })) as any;
    assert.deepEqual(p.end, { dateTime: "2026-08-11T00:30:00", timeZone: "Europe/Rome" });
  });

  test("endTime <= time rolls end to next day (crossing midnight)", () => {
    const p = eventToGooglePayload(makeEvent({ time: "22:00", endTime: "01:00" })) as any;
    assert.deepEqual(p.end, { dateTime: "2026-08-11T01:00:00", timeZone: "Europe/Rome" });
  });

  // Regressione prod 2026-08-12: righe con time="15"/end_time="16" (senza
  // minuti) producevano dateTime "…T15:00" rifiutati da Google con 400.
  test("bare-hour times are normalized to HH:MM (prod 400 regression)", () => {
    const p = eventToGooglePayload(makeEvent({ time: "15", endTime: "16" })) as any;
    assert.deepEqual(p.start, { dateTime: "2026-08-10T15:00:00", timeZone: "Europe/Rome" });
    assert.deepEqual(p.end, { dateTime: "2026-08-10T16:00:00", timeZone: "Europe/Rome" });
  });

  test("single-digit hour is zero-padded", () => {
    const p = eventToGooglePayload(makeEvent({ time: "9:30", endTime: null })) as any;
    assert.deepEqual(p.start, { dateTime: "2026-08-10T09:30:00", timeZone: "Europe/Rome" });
    assert.deepEqual(p.end, { dateTime: "2026-08-10T10:30:00", timeZone: "Europe/Rome" });
  });

  test("unrecoverable time falls back to all-day instead of a broken payload", () => {
    const p = eventToGooglePayload(makeEvent({ time: "boh", endTime: null })) as any;
    assert.deepEqual(p.start, { date: "2026-08-10" });
    assert.deepEqual(p.end, { date: "2026-08-11" });
  });

  test("malformed endTime is ignored (falls back to +1h)", () => {
    const p = eventToGooglePayload(makeEvent({ time: "18:30", endTime: "x" })) as any;
    assert.deepEqual(p.end, { dateTime: "2026-08-10T19:30:00", timeZone: "Europe/Rome" });
  });

  // Promemoria: mai i default di Google (per gli all-day suonavano la sera
  // prima, es. 23:30). Con orario: popup 1 ora prima; all-day: nessuno.
  test("timed event gets a 1-hour popup reminder (no Google defaults)", () => {
    const p = eventToGooglePayload(makeEvent({ time: "15:00" })) as any;
    assert.deepEqual(p.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] });
  });

  test("all-day event gets no Google reminder (no 23:30 evening-before)", () => {
    const p = eventToGooglePayload(makeEvent({ time: null, allDay: true })) as any;
    assert.deepEqual(p.reminders, { useDefault: false, overrides: [] });
  });

  test("unrecoverable time (all-day fallback) also disables Google reminders", () => {
    const p = eventToGooglePayload(makeEvent({ time: "boh", endTime: null })) as any;
    assert.deepEqual(p.reminders, { useDefault: false, overrides: [] });
  });
});

// ---------------------------------------------------------------------------
// Test end-to-end con fetch mockato: create/update/delete verso calendar/v3,
// retry su 401 e transizione a 'expired' su invalid_grant. Richiede il DB
// (connessioni e link vengono scritti su tabelle reali), ma NESSUNA chiamata
// esce verso Google: globalThis.fetch è sostituita.
// ---------------------------------------------------------------------------

import { db } from "../db";
import {
  users,
  families,
  familyMembers,
  calendarEvents,
  googleCalendarConnections,
  googleCalendarEventLinks,
  blocks,
  bills,
} from "../../shared/schema";

const hasDb = !!process.env.DATABASE_URL;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_PREFIX = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface RecordedCall {
  url: string;
  method: string;
  auth: string | null;
  body: any;
}

describe("google calendar sync end-to-end (fetch mockato)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  const realFetch = globalThis.fetch;
  let calls: RecordedCall[] = [];
  // Handler configurabile per ogni test: riceve la chiamata registrata e
  // ritorna la Response simulata; se ritorna undefined si usa il default.
  let handler: (call: RecordedCall) => Response | Promise<Response | undefined> | undefined = () => undefined;
  let tokenCounter = 0;

  const userIds: string[] = [];
  const familyIds: string[] = [];
  const eventIds: string[] = [];

  // Ogni test usa una famiglia dedicata: il fan-out di syncCreatedEvents
  // altrimenti raggiungerebbe anche gli utenti dei test precedenti.
  async function makeFamily(): Promise<string> {
    const [f] = await db.insert(families).values({ name: "Gcal E2E Test Family" }).returning({ id: families.id });
    familyIds.push(f!.id);
    return f!.id;
  }

  async function makeUser(label: string, familyId: string): Promise<string> {
    const [u] = await db
      .insert(users)
      .values({
        email: `gcal-e2e-${label}-${Date.now()}@example.com`,
        passwordHash: "x",
        name: `Gcal E2E ${label}`,
        emailVerified: true,
      })
      .returning({ id: users.id });
    userIds.push(u!.id);
    await db.insert(familyMembers).values({ familyId, userId: u!.id, role: "admin", color: "#00ff00" });
    await db.insert(googleCalendarConnections).values({
      userId: u!.id,
      googleEmail: `${label}@gmail.com`,
      refreshTokenEnc: encryptToken(`refresh-${label}`),
      status: "active",
    });
    return u!.id;
  }

  async function makeDbEvent(
    title: string,
    createdBy: string,
    familyId: string,
    date = "2026-09-01",
  ): Promise<CalendarEvent> {
    const [e] = await db
      .insert(calendarEvents)
      .values({ familyId, title, date, time: "18:00", color: "#6366F1", createdBy })
      .returning();
    eventIds.push(e!.id);
    return e as CalendarEvent;
  }

  async function getConn(userId: string) {
    const [c] = await db
      .select()
      .from(googleCalendarConnections)
      .where(eq(googleCalendarConnections.userId, userId));
    return c!;
  }

  before(async () => {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const headers = init?.headers || {};
      const call: RecordedCall = {
        url,
        method,
        auth: headers.Authorization ?? null,
        body: init?.body
          ? typeof init.body === "string"
            ? safeParse(init.body)
            : Object.fromEntries(new URLSearchParams(String(init.body)))
          : null,
      };
      calls.push(call);
      const custom = await handler(call);
      if (custom) return custom;
      // Default: token endpoint rilascia un token nuovo, calendar API ok.
      if (url === TOKEN_URL) {
        tokenCounter += 1;
        return json200({ access_token: `tok-${tokenCounter}`, expires_in: 3600 });
      }
      if (url.startsWith(CAL_PREFIX)) {
        if (method === "DELETE") return new Response(null, { status: 204 });
        return json200({ id: call.body?.id ?? `gid-${calls.length}` });
      }
      throw new Error(`Chiamata fetch inattesa nel test: ${method} ${url}`);
    }) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    for (const id of familyIds) await db.delete(families).where(eq(families.id, id));
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  });

  beforeEach(() => {
    calls = [];
    handler = () => undefined;
  });

  function safeParse(s: string): any {
    try { return JSON.parse(s); } catch { return s; }
  }
  function json200(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  async function waitUntil(
    predicate: () => boolean | Promise<boolean>,
    message: string,
    timeoutMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(message);
  }

  test("evento creato → POST corretto su calendar/v3, link salvato, lastSyncAt aggiornato", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("create", familyId);
    const ev = await makeDbEvent("Cena di prova", userId, familyId);

    await syncCreatedEvents(familyId, [ev], userId);

    // 1) refresh token, 2) POST insert evento
    const tokenCall = calls.find((c) => c.url === TOKEN_URL);
    assert.ok(tokenCall, "deve rinnovare l'access token col refresh token");
    assert.equal(tokenCall!.body.grant_type, "refresh_token");
    assert.equal(tokenCall!.body.refresh_token, "refresh-create");

    const post = calls.find((c) => c.url === CAL_PREFIX && c.method === "POST");
    assert.ok(post, "deve fare POST su calendar/v3 events");
    assert.match(post!.auth ?? "", /^Bearer tok-/);
    assert.equal(post!.body.summary, "Cena di prova");
    assert.equal(post!.body.extendedProperties.private.familySyncEventId, ev.id);
    assert.deepEqual(post!.body.start, { dateTime: "2026-09-01T18:00:00", timeZone: "Europe/Rome" });

    const links = await getLinksForEvents([ev.id]);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.userId, userId);
    assert.equal(links[0]!.googleEventId, googleEventIdForFamilySyncEvent(ev.id));

    const conn = await getConn(userId);
    assert.equal(conn.status, "active");
    assert.ok(conn.lastSyncAt, "lastSyncAt deve essere valorizzato dopo un sync riuscito");
    assert.equal(conn.lastError, null);
  });

  test("evento modificato → PATCH sull'id Google giusto", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("update", familyId);
    const ev = await makeDbEvent("Da aggiornare", userId, familyId);
    await db.insert(googleCalendarEventLinks).values({ userId, eventId: ev.id, googleEventId: "gid-update-1" });

    const [updated] = await db
      .update(calendarEvents)
      .set({ title: "Titolo nuovo", updatedAt: new Date() })
      .where(eq(calendarEvents.id, ev.id))
      .returning();
    await syncUpdatedEvent(updated);

    const patch = calls.find((c) => c.method === "PATCH");
    assert.ok(patch, "deve fare PATCH");
    assert.equal(patch!.url, `${CAL_PREFIX}/gid-update-1`);
    assert.equal(patch!.body.summary, "Titolo nuovo");
  });

  test("PATCH su evento cancellato a mano su Google (404) → ricreato con POST", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("recreate", familyId);
    const ev = await makeDbEvent("Sparito su Google", userId, familyId);
    await db.insert(googleCalendarEventLinks).values({ userId, eventId: ev.id, googleEventId: "gid-gone" });

    handler = (c) => (c.method === "PATCH" ? new Response("Not Found", { status: 404 }) : undefined);
    await syncUpdatedEvent(ev);

    const post = calls.find((c) => c.method === "POST" && c.url === CAL_PREFIX);
    assert.ok(post, "dopo il 404 deve ricreare l'evento con POST");
    const links = await getLinksForEvents([ev.id]);
    assert.equal(links.length, 1);
    assert.notEqual(links[0]!.googleEventId, "gid-gone");
  });

  test("evento eliminato → DELETE sull'id Google; 404 tollerato senza errori", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("delete", familyId);
    await syncDeletedEvents([
      { userId, googleEventId: "gid-del-1" },
      { userId, googleEventId: "gid-del-2" },
    ]);

    const dels = calls.filter((c) => c.method === "DELETE");
    assert.equal(dels.length, 2);
    assert.deepEqual(
      dels.map((c) => c.url).sort(),
      [`${CAL_PREFIX}/gid-del-1`, `${CAL_PREFIX}/gid-del-2`],
    );

    // 404 = già rimosso: nessun lastError registrato.
    calls = [];
    handler = (c) => (c.method === "DELETE" ? new Response("Not Found", { status: 404 }) : undefined);
    await syncDeletedEvents([{ userId, googleEventId: "gid-del-3" }]);
    const conn = await getConn(userId);
    assert.equal(conn.lastError, null);
  });

  test("bollette: creazione, modifica, pagamento ed eliminazione si riflettono su Google", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("bills", familyId);
    let server: Server | undefined;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { userId, email: "bills@test.local" };
      next();
    });
    app.use("/api/bills", billsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server!.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const request = (method: string, path: string, body?: unknown) =>
      realFetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    try {
      let releaseCreate: (() => void) | undefined;
      let releaseAlignmentPatch: (() => void) | undefined;
      handler = (call) => {
        if (call.method === "POST" && call.url === CAL_PREFIX) {
          return new Promise<Response>((resolve) => {
            releaseCreate = () => resolve(json200({ id: call.body.id }));
          });
        }
        if (call.method === "PATCH" && !releaseAlignmentPatch) {
          return new Promise<Response>((resolve) => {
            releaseAlignmentPatch = () => resolve(json200({ id: createdGoogleId }));
          });
        }
        return undefined;
      };
      let createdGoogleId = "";
      const createRes = await request("POST", `/api/bills/${familyId}`, {
        title: "Energia agosto",
        provider: "Fornitore Test",
        amount: 87.45,
        dueDate: "2099-08-20",
      });
      assert.equal(createRes.status, 201);
      const created = (await createRes.json()) as { id: string; calendarEventId: string | null };
      assert.ok(created.calendarEventId, "la bolletta attiva deve avere un evento calendario");
      createdGoogleId = googleEventIdForFamilySyncEvent(created.calendarEventId);

      await waitUntil(() => !!releaseCreate, "la creazione Google deve essere in volo");
      const updateRes = await request("PUT", `/api/bills/${familyId}/${created.id}`, {
        title: "Energia settembre",
        dueDate: "2099-09-20",
      });
      assert.equal(updateRes.status, 200);
      releaseCreate!();

      await waitUntil(
        () => !!releaseAlignmentPatch,
        "il riallineamento della prima modifica deve essere in volo",
      );
      const secondUpdateRes = await request("PUT", `/api/bills/${familyId}/${created.id}`, {
        title: "Energia ottobre",
        dueDate: "2099-10-20",
      });
      assert.equal(secondUpdateRes.status, 200);
      await waitUntil(
        () =>
          calls.some(
            (call) =>
              call.method === "PATCH" &&
              call.body.summary === "Scadenza bolletta: Energia ottobre",
          ),
        "il secondo update deve poter avanzare mentre il primo PATCH è bloccato",
      );
      const patchCountBeforeRelease = calls.filter((call) => call.method === "PATCH").length;
      assert.ok(patchCountBeforeRelease >= 2, "i PATCH devono essere realmente fuori ordine");
      releaseAlignmentPatch!();

      await waitUntil(
        async () => (await getLinksForEvents([created.calendarEventId!])).length === 1,
        "la creazione della bolletta deve salvare il link Google",
      );
      const [createdLink] = await getLinksForEvents([created.calendarEventId]);
      const insertCall = calls.find(
        (call) =>
          call.method === "POST" &&
          call.url === CAL_PREFIX &&
          call.body.extendedProperties.private.familySyncEventId === created.calendarEventId,
      );
      assert.ok(insertCall, "la scadenza della bolletta deve essere creata su Google");
      assert.equal(insertCall.body.summary, "Scadenza bolletta: Energia agosto");
      assert.deepEqual(insertCall.body.start, { date: "2099-08-20" });
      await waitUntil(
        () =>
          calls.filter((call) => call.method === "PATCH").length > patchCountBeforeRelease &&
          calls.filter((call) => call.method === "PATCH").at(-1)?.body.summary ===
            "Scadenza bolletta: Energia ottobre",
        "il PATCH vecchio completato per ultimo deve compensare con lo snapshot più recente",
      );
      const patchCall = calls.filter((call) => call.method === "PATCH").at(-1);
      assert.equal(patchCall?.url, `${CAL_PREFIX}/${createdLink.googleEventId}`);
      assert.equal(patchCall?.body.summary, "Scadenza bolletta: Energia ottobre");
      assert.deepEqual(patchCall?.body.start, { date: "2099-10-20" });

      handler = () => undefined;
      calls = [];
      const payRes = await request("PATCH", `/api/bills/${familyId}/${created.id}/pay`, { paid: true });
      assert.equal(payRes.status, 200);
      await waitUntil(
        () => calls.some((call) => call.method === "DELETE"),
        "il pagamento della bolletta deve rimuovere l'evento Google",
      );
      assert.ok(
        calls.some(
          (call) =>
            call.method === "DELETE" &&
            call.url === `${CAL_PREFIX}/${createdLink.googleEventId}`,
        ),
      );
      const [paidBill] = await db.select().from(bills).where(eq(bills.id, created.id));
      assert.equal(paidBill?.calendarEventId, null);

      let releaseDeleteCreate: (() => void) | undefined;
      handler = (call) => {
        if (call.method !== "POST" || call.url !== CAL_PREFIX) return undefined;
        return new Promise<Response>((resolve) => {
          releaseDeleteCreate = () => resolve(json200({ id: call.body.id }));
        });
      };
      calls = [];
      const secondCreateRes = await request("POST", `/api/bills/${familyId}`, {
        title: "Acqua da eliminare",
        amount: 31,
        dueDate: "2099-10-15",
      });
      assert.equal(secondCreateRes.status, 201);
      const second = (await secondCreateRes.json()) as { id: string; calendarEventId: string | null };
      assert.ok(second.calendarEventId);
      await waitUntil(
        () => !!releaseDeleteCreate,
        "la seconda creazione Google deve essere in volo",
      );
      const expectedGoogleEventId = googleEventIdForFamilySyncEvent(second.calendarEventId);
      const deleteRes = await request("DELETE", `/api/bills/${familyId}/${second.id}`);
      assert.equal(deleteRes.status, 200);
      await waitUntil(
        () =>
          calls.some(
            (call) =>
              call.method === "DELETE" &&
              call.url === `${CAL_PREFIX}/${expectedGoogleEventId}`,
          ),
        "la DELETE deve anticipare anche una creazione Google senza mapping",
      );
      releaseDeleteCreate!();
      await waitUntil(
        () =>
          calls.filter(
            (call) =>
              call.method === "DELETE" &&
              call.url === `${CAL_PREFIX}/${expectedGoogleEventId}`,
          ).length >= 2,
        "la POST completata dopo la cancellazione deve ripulire l'evento remoto",
      );
      assert.equal((await db.select().from(bills).where(eq(bills.id, second.id))).length, 0);
      assert.equal((await getLinksForEvents([second.calendarEventId])).length, 0);
    } finally {
      handler = () => undefined;
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test(
    "Google bloccato non impedisce a query DB indipendenti di avanzare",
    { timeout: 10_000 },
    async () => {
      const scenarios: { familyId: string; userId: string; event: CalendarEvent }[] = [];
      for (let i = 0; i < 12; i += 1) {
        const familyId = await makeFamily();
        const userId = await makeUser(`pool-${i}`, familyId);
        const event = await makeDbEvent(`Pool ${i}`, userId, familyId, `2099-11-${String(i + 1).padStart(2, "0")}`);
        scenarios.push({ familyId, userId, event });
      }

      let inFlightPosts = 0;
      let releaseBlockedPosts: (() => void) | undefined;
      const blockedPosts = new Promise<void>((resolve) => {
        releaseBlockedPosts = resolve;
      });
      handler = async (call) => {
        if (call.method !== "POST" || call.url !== CAL_PREFIX) return undefined;
        inFlightPosts += 1;
        await blockedPosts;
        inFlightPosts -= 1;
        return json200({ id: call.body.id });
      };

      const syncPromise = Promise.all(
        scenarios.map(({ familyId, userId, event }) =>
          syncCreatedEvents(familyId, [event], userId),
        ),
      );
      try {
        await waitUntil(
          () => inFlightPosts >= 2,
          "più chiamate Google devono essere bloccate contemporaneamente",
        );
        const independentQueryCompleted = await Promise.race([
          db
            .select({ id: families.id })
            .from(families)
            .where(eq(families.id, scenarios[0].familyId))
            .limit(1)
            .then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 750)),
        ]);
        assert.equal(
          independentQueryCompleted,
          true,
          "una fetch Google bloccata non deve trattenere connessioni del pool",
        );
      } finally {
        releaseBlockedPosts?.();
      }
      await syncPromise;

      assert.equal(
        calls.filter((call) => call.method === "POST" && call.url === CAL_PREFIX).length,
        scenarios.length,
      );
      for (const { event } of scenarios) {
        assert.equal(
          (await getLinksForEvents([event.id])).length,
          1,
          `mapping mancante per ${event.title}`,
        );
      }
    },
  );

  test("401 dalla calendar API → un solo retry con token fresco, poi ok", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("retry401", familyId);
    const ev = await makeDbEvent("Retry 401", userId, familyId);

    let first401Done = false;
    handler = (c) => {
      if (c.method === "POST" && c.url === CAL_PREFIX && !first401Done) {
        first401Done = true;
        return new Response("Unauthorized", { status: 401 });
      }
      return undefined;
    };

    await syncCreatedEvents(familyId, [ev], userId);

    const posts = calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX);
    assert.equal(posts.length, 2, "un tentativo + un retry");
    assert.notEqual(posts[0]!.auth, posts[1]!.auth, "il retry deve usare un token nuovo");
    const tokenCalls = calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 2, "deve rinnovare il token per il retry");
    assert.equal((await getLinksForEvents([ev.id])).length, 1);
    assert.equal((await getConn(userId)).status, "active");
  });

  test("401 anche dopo il retry → collegamento marcato 'expired'", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("double401", familyId);
    const ev = await makeDbEvent("Doppio 401", userId, familyId);

    handler = (c) =>
      c.method === "POST" && c.url === CAL_PREFIX ? new Response("Unauthorized", { status: 401 }) : undefined;

    await syncCreatedEvents(familyId, [ev], userId);

    const conn = await getConn(userId);
    assert.equal(conn.status, "expired");
    assert.ok(conn.lastError, "deve spiegare il motivo nel lastError");
    assert.equal((await getLinksForEvents([ev.id])).length, 0, "nessun link salvato");
  });

  test("invalid_grant sul refresh → collegamento marcato 'expired', nessuna chiamata calendar", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("invalidgrant", familyId);
    const ev = await makeDbEvent("Invalid grant", userId, familyId);

    handler = (c) =>
      c.url === TOKEN_URL
        ? new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
        : undefined;

    await syncCreatedEvents(familyId, [ev], userId);

    const conn = await getConn(userId);
    assert.equal(conn.status, "expired");
    assert.match(conn.lastError ?? "", /ricollega/i);
    assert.equal(calls.filter((c) => c.url.startsWith(CAL_PREFIX)).length, 0, "mai chiamata la calendar API");

    // Con lo stato 'expired' i sync successivi NON riprovano il refresh.
    calls = [];
    await syncCreatedEvents(familyId, [ev], userId);
    assert.equal(calls.length, 0, "collegamento expired ⇒ utente escluso dal fan-out");
  });

  test("scope insufficiente (403) → collegamento marcato 'expired'", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("noscope", familyId);
    const ev = await makeDbEvent("Senza scope", userId, familyId);

    handler = (c) =>
      c.method === "POST" && c.url === CAL_PREFIX
        ? new Response(JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } }), { status: 403 })
        : undefined;

    await syncCreatedEvents(familyId, [ev], userId);
    assert.equal((await getConn(userId)).status, "expired");
  });

  test("errore temporaneo Google (500) → lastError registrato ma collegamento resta attivo", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("http500", familyId);
    const ev = await makeDbEvent("Errore 500", userId, familyId);

    handler = (c) =>
      c.method === "POST" && c.url === CAL_PREFIX ? new Response("Server Error", { status: 500 }) : undefined;

    await syncCreatedEvents(familyId, [ev], userId);

    const conn = await getConn(userId);
    assert.equal(conn.status, "active", "un 500 non deve invalidare il collegamento");
    assert.match(conn.lastError ?? "", /500/);
    assert.equal((await getLinksForEvents([ev.id])).length, 0);
  });

  // -------------------------------------------------------------------------
  // Backfill iniziale (backfillUserCalendar): niente duplicati, niente eventi
  // passati, tetto BACKFILL_MAX_EVENTS rispettato, lastSyncAt aggiornato.
  // -------------------------------------------------------------------------

  test("backfill: copia solo eventi futuri, salta i già collegati, aggiorna lastSyncAt", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("backfill", familyId);

    const past = await makeDbEvent("Evento passato", userId, familyId, "2020-01-01");
    const future1 = await makeDbEvent("Futuro nuovo", userId, familyId, "2099-01-01");
    const future2 = await makeDbEvent("Futuro già collegato", userId, familyId, "2099-01-02");
    // future2 è già sincronizzato: il backfill NON deve toccarlo.
    await db.insert(googleCalendarEventLinks).values({ userId, eventId: future2.id, googleEventId: "gid-already" });

    await backfillUserCalendar(userId);

    const posts = calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX);
    assert.equal(posts.length, 1, "deve creare SOLO l'evento futuro non ancora collegato");
    assert.equal(posts[0]!.body.extendedProperties.private.familySyncEventId, future1.id);

    // Nessun duplicato: il link di future2 resta quello originale.
    const links2 = await getLinksForEvents([future2.id]);
    assert.equal(links2.length, 1);
    assert.equal(links2[0]!.googleEventId, "gid-already");
    // L'evento passato non ha alcun link.
    assert.equal((await getLinksForEvents([past.id])).length, 0);
    // Il nuovo futuro ha esattamente un link.
    assert.equal((await getLinksForEvents([future1.id])).length, 1);

    const conn = await getConn(userId);
    assert.ok(conn.lastSyncAt, "lastSyncAt deve essere aggiornato dopo il backfill");
    assert.equal(conn.lastError, null);
  });

  test("backfill ripetuto: seconda esecuzione non crea alcun duplicato", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("backfill-idem", familyId);
    const ev = await makeDbEvent("Idempotente", userId, familyId, "2099-03-01");

    await backfillUserCalendar(userId);
    assert.equal(calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX).length, 1);

    calls = [];
    await backfillUserCalendar(userId);
    assert.equal(
      calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX).length,
      0,
      "il secondo backfill deve saltare l'evento già collegato",
    );
    assert.equal((await getLinksForEvents([ev.id])).length, 1, "un solo link, mai duplicato");
  });

  test("backfill: esclude gli eventi creati da utenti in blocco reciproco", async () => {
    const familyId = await makeFamily();
    const target = await makeUser("backfill-target", familyId);
    const blocked = await makeUser("backfill-blocked", familyId);

    // Blocco reciproco: target ha bloccato "blocked" (basta una direzione).
    await db.insert(blocks).values({ familyId, blockerUserId: target, blockedUserId: blocked });

    const own = await makeDbEvent("Mio evento", target, familyId, "2099-04-01");
    const fromBlocked = await makeDbEvent("Evento del bloccato", blocked, familyId, "2099-04-02");

    calls = [];
    await backfillUserCalendar(target);

    const posts = calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX);
    const pushedIds = posts.map((c) => c.body.extendedProperties.private.familySyncEventId);
    assert.ok(pushedIds.includes(own.id), "il proprio evento deve essere copiato");
    assert.ok(!pushedIds.includes(fromBlocked.id), "l'evento dell'utente bloccato NON deve essere copiato");

    // Nessun link creato per l'evento dell'utente bloccato verso target.
    const links = await getLinksForEvents([fromBlocked.id]);
    assert.equal(links.filter((l) => l.userId === target).length, 0);
  });

  // -------------------------------------------------------------------------
  // Pulizia retroattiva: link creati PRIMA del fix del backfill verso eventi
  // di utenti in blocco reciproco → DELETE su Google e link rimosso.
  // -------------------------------------------------------------------------

  test("cleanup: rimuove da Google gli eventi di utenti bloccati già copiati, lasciando gli altri", async () => {
    const familyId = await makeFamily();
    const target = await makeUser("cleanup-target", familyId);
    const blocked = await makeUser("cleanup-blocked", familyId);

    await db.insert(blocks).values({ familyId, blockerUserId: target, blockedUserId: blocked });

    const own = await makeDbEvent("Mio evento ok", target, familyId, "2099-05-01");
    const fromBlocked = await makeDbEvent("Copiato prima del fix", blocked, familyId, "2099-05-02");

    // Link "storici": entrambi già copiati sul Google Calendar di target.
    await db.insert(googleCalendarEventLinks).values([
      { userId: target, eventId: own.id, googleEventId: "gid-keep" },
      { userId: target, eventId: fromBlocked.id, googleEventId: "gid-purge" },
    ]);
    // Il link del creatore bloccato verso il PROPRIO evento non va toccato.
    await db.insert(googleCalendarEventLinks).values({
      userId: blocked, eventId: fromBlocked.id, googleEventId: "gid-own-of-blocked",
    });

    calls = [];
    await removeBlockedEventLinks();

    const dels = calls.filter((c) => c.method === "DELETE");
    assert.deepEqual(dels.map((c) => c.url), [`${CAL_PREFIX}/gid-purge`], "DELETE solo per l'evento dell'utente bloccato");

    const linksBlockedEv = await getLinksForEvents([fromBlocked.id]);
    assert.equal(linksBlockedEv.filter((l) => l.userId === target).length, 0, "link target→evento bloccato rimosso");
    assert.equal(linksBlockedEv.filter((l) => l.userId === blocked).length, 1, "il creatore mantiene il suo link");
    assert.equal((await getLinksForEvents([own.id])).length, 1, "il link all'evento proprio resta");
  });

  test("cleanup: 404 su Google → link comunque rimosso; errore 500 → link mantenuto per il retry", async () => {
    const familyId = await makeFamily();
    const target = await makeUser("cleanup-err", familyId);
    const blocked = await makeUser("cleanup-err-blocked", familyId);
    await db.insert(blocks).values({ familyId, blockerUserId: blocked, blockedUserId: target });

    const ev404 = await makeDbEvent("Già sparito su Google", blocked, familyId, "2099-05-03");
    const ev500 = await makeDbEvent("Errore temporaneo", blocked, familyId, "2099-05-04");
    await db.insert(googleCalendarEventLinks).values([
      { userId: target, eventId: ev404.id, googleEventId: "gid-404" },
      { userId: target, eventId: ev500.id, googleEventId: "gid-500" },
    ]);

    handler = (c) => {
      if (c.method !== "DELETE") return undefined;
      if (c.url.endsWith("/gid-404")) return new Response("Not Found", { status: 404 });
      if (c.url.endsWith("/gid-500")) return new Response("Server Error", { status: 500 });
      return undefined;
    };
    await removeBlockedEventLinks();

    assert.equal((await getLinksForEvents([ev404.id])).length, 0, "404 = già rimosso: link cancellato");
    assert.equal((await getLinksForEvents([ev500.id])).length, 1, "500 = link mantenuto, ritenterà");
  });

  test("backfill: rispetta il tetto di 250 eventi", async () => {
    const familyId = await makeFamily();
    const userId = await makeUser("backfill-cap", familyId);

    // 252 eventi futuri inseriti in batch (oltre il tetto di 250).
    const rows = Array.from({ length: 252 }, (_, i) => ({
      familyId,
      title: `Cap ${i}`,
      date: "2099-06-01",
      time: "10:00",
      color: "#6366F1",
      createdBy: userId,
    }));
    const inserted = await db.insert(calendarEvents).values(rows).returning({ id: calendarEvents.id });
    for (const r of inserted) eventIds.push(r.id);

    await backfillUserCalendar(userId);

    const posts = calls.filter((c) => c.method === "POST" && c.url === CAL_PREFIX);
    assert.equal(posts.length, 250, "mai più di BACKFILL_MAX_EVENTS creazioni");
  });
});
