import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  families,
  familyMembers,
  calendarEvents,
  eventReminderLog,
} from "../../shared/schema";
import { buildChoreReminderPath, runEventRemindersOnce } from "../lib/event-reminders";

/**
 * Test di INTEGRAZIONE contro il DB reale: verifica claim atomico e dedup dei
 * promemoria eventi (event_reminder_log). Richiede DATABASE_URL. Le email non
 * partono davvero: RESEND_API_KEY viene svuotata per il test (isEmailConfigured
 * false ⇒ solo log dev), e la famiglia non ha token push registrati.
 */
const hasDb = !!process.env.DATABASE_URL;

test("il link del promemoria faccenda conserva famiglia, giorno e faccenda", () => {
  assert.equal(
    buildChoreReminderPath({
      familyId: "family-1",
      date: "2026-08-20",
      choreId: "chore-1",
    }),
    "/chores?familyId=family-1&date=2026-08-20&choreId=chore-1",
  );
});

describe("event reminders (DB)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let familyId: string;
  let userId: string;
  let eventTodayId: string;
  let eventTomorrowId: string;
  let eventFarId: string;
  const savedResendKey = process.env.RESEND_API_KEY;

  const TZ = "Europe/Rome";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  before(async () => {
    delete process.env.RESEND_API_KEY;
    const [u] = await db
      .insert(users)
      .values({
        email: `event-rem-test-${Date.now()}@example.com`,
        passwordHash: "x",
        name: "Event Reminder Test",
        emailVerified: true,
      })
      .returning({ id: users.id });
    userId = u!.id;
    const [f] = await db.insert(families).values({ name: "Event Reminder Test Family" }).returning({ id: families.id });
    familyId = f!.id;
    await db.insert(familyMembers).values({ familyId, userId, role: "admin", color: "#00ff00" });

    const mkEvent = async (date: string) => {
      const [e] = await db
        .insert(calendarEvents)
        .values({
          familyId,
          title: `Evento test ${date}`,
          date,
          color: "#ff0000",
          createdBy: userId,
        })
        .returning({ id: calendarEvents.id });
      return e!.id;
    };
    eventTodayId = await mkEvent(today);
    eventTomorrowId = await mkEvent(addDays(today, 1));
    eventFarId = await mkEvent(addDays(today, 10));
  });

  after(async () => {
    if (savedResendKey !== undefined) process.env.RESEND_API_KEY = savedResendKey;
    // Cascade elimina eventi, membership e log.
    await db.delete(families).where(eq(families.id, familyId));
    await db.delete(users).where(eq(users.id, userId));
  });

  test("primo giro: claim per oggi e domani, non per eventi lontani", async () => {
    await runEventRemindersOnce(18);

    const logToday = await db
      .select()
      .from(eventReminderLog)
      .where(and(eq(eventReminderLog.eventId, eventTodayId), eq(eventReminderLog.kind, "event_today")));
    assert.equal(logToday.length, 1);

    const logTomorrow = await db
      .select()
      .from(eventReminderLog)
      .where(and(eq(eventReminderLog.eventId, eventTomorrowId), eq(eventReminderLog.kind, "event_tomorrow")));
    assert.equal(logTomorrow.length, 1);

    const logFar = await db
      .select()
      .from(eventReminderLog)
      .where(eq(eventReminderLog.eventId, eventFarId));
    assert.equal(logFar.length, 0);
  });

  test("secondo giro: nessun doppio invio (dedup)", async () => {
    await runEventRemindersOnce(18);
    const logToday = await db
      .select()
      .from(eventReminderLog)
      .where(eq(eventReminderLog.eventId, eventTodayId));
    assert.equal(logToday.length, 1, "una sola riga per (evento, kind)");
  });

  test("claim concorrenti: una sola vince", async () => {
    // Simula più istanze che tentano il claim sullo stesso evento/kind.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        db
          .insert(eventReminderLog)
          .values({ eventId: eventFarId, kind: "event_today" })
          .onConflictDoNothing()
          .returning({ id: eventReminderLog.id }),
      ),
    );
    const wins = results.filter((r) => r.length > 0).length;
    assert.equal(wins, 1);
  });
});
