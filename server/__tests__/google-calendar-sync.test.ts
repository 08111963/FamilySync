import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

import {
  encryptToken,
  decryptToken,
  signGcalOauthState,
  verifyGcalOauthState,
  eventToGooglePayload,
} from "../lib/google-calendar-sync";
import type { CalendarEvent } from "../../shared/schema";

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
});
