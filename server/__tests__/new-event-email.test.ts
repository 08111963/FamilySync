import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, blocks, calendarEvents } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE (DB reale + HTTP) per l'email "nuovo evento":
 * - l'autore NON riceve mai l'email
 * - gli utenti in blocco reciproco con l'autore sono esclusi
 * - solo i membri con email verificata ricevono l'email
 * - UNA sola email per destinatario anche per una serie ricorrente
 * - l'invio è fire-and-forget: la risposta 201 arriva anche se Resend è lento
 *
 * Le email non partono davvero: intercettiamo `fetch` verso api.resend.com
 * (il client Resend usa fetch) e catturiamo i payload. Tutte le altre
 * richieste fetch (incluse quelle del test verso il server locale) passano.
 */
const hasDb = !!process.env.DATABASE_URL;

type CapturedEmail = { to: string | string[]; subject: string };

describe("email nuovo evento (fanout)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let authorToken: string;
  let authorEmail: string;
  let verifiedEmail: string;
  let unverifiedEmail: string;
  let blockedEmail: string;

  const savedResendKey = process.env.RESEND_API_KEY;
  const realFetch = globalThis.fetch;
  const captured: CapturedEmail[] = [];
  // Gate: finché non viene rilasciato, le chiamate a Resend restano appese.
  // Serve a dimostrare che la POST risponde SENZA aspettare le email.
  let releaseEmails!: () => void;
  const emailGate = new Promise<void>((resolve) => {
    releaseEmails = resolve;
  });

  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function seedUser(email: string, emailVerified: boolean) {
    const [u] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash: "x".repeat(20),
      name: email.split("@")[0],
      emailVerified,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    return u;
  }

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    // Chiave fittizia: isEmailConfigured() deve essere true perché il fanout
    // parta davvero e arrivi fino alla chiamata (intercettata) a Resend.
    process.env.RESEND_API_KEY = "re_test_dummy_key";

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      if (url.includes("api.resend.com")) {
        await emailGate; // tiene "lento" Resend finché il test non rilascia
        try {
          const body = JSON.parse(init?.body ?? "{}");
          captured.push({ to: body.to, subject: body.subject });
        } catch {
          captured.push({ to: "<unparsable>", subject: "<unparsable>" });
        }
        return new Response(JSON.stringify({ id: `mock-${captured.length}` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const id = uniq();
    authorEmail = `autore-${id}@example.com`;
    verifiedEmail = `verificato-${id}@example.com`;
    unverifiedEmail = `nonverificato-${id}@example.com`;
    blockedEmail = `bloccato-${id}@example.com`;

    const author = await seedUser(authorEmail, true);
    const verified = await seedUser(verifiedEmail, true);
    const unverified = await seedUser(unverifiedEmail, false);
    const blocked = await seedUser(blockedEmail, true);
    authorToken = generateAccessToken(author);

    const [fam] = await db.insert(families).values({ name: "Fam Email Test", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);

    await db.insert(familyMembers).values([
      { familyId, userId: author.id, role: "admin", nickname: "Autore", color: "#6366F1", points: 0 },
      { familyId, userId: verified.id, role: "adult", nickname: "Verificato", color: "#10B981", points: 0 },
      { familyId, userId: unverified.id, role: "adult", nickname: "NonVerificato", color: "#F59E0B", points: 0 },
      { familyId, userId: blocked.id, role: "adult", nickname: "Bloccato", color: "#EF4444", points: 0 },
    ]);

    // "Bloccato" ha bloccato l'autore: relazione block-related in entrambe le direzioni.
    await db.insert(blocks).values({ familyId, blockerUserId: blocked.id, blockedUserId: author.id });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    if (savedResendKey !== undefined) process.env.RESEND_API_KEY = savedResendKey;
    else delete process.env.RESEND_API_KEY;
    try {
      if (created.families.length) {
        await db.delete(calendarEvents).where(inArray(calendarEvents.familyId, created.families));
        await db.delete(blocks).where(inArray(blocks.familyId, created.families));
        await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
        await db.delete(families).where(inArray(families.id, created.families));
      }
      if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("serie ricorrente: 201 subito, poi UNA email al solo membro verificato non bloccato", async () => {
    const res = await fetch(`${baseUrl}/api/calendar/${familyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authorToken}` },
      body: JSON.stringify({
        title: "Allenamento settimanale",
        date: "2026-08-10",
        time: "18:00",
        color: "#6366F1",
        recurrenceRule: "weekly:1",
      }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, `atteso 201, ricevuto ${res.status}: ${text}`);
    const event = JSON.parse(text);
    assert.equal(event.title, "Allenamento settimanale");

    // La risposta è arrivata mentre Resend era ancora "appeso": l'invio
    // email NON blocca la risposta API.
    assert.equal(captured.length, 0, "nessuna email deve essere completata prima della risposta");

    // Verifica che la serie sia davvero multi-occorrenza (altrimenti il test
    // "una sola email per serie" non proverebbe nulla).
    const rows = await db.select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(inArray(calendarEvents.familyId, [familyId]));
    assert.ok(rows.length > 1, `attese più occorrenze per la serie, trovate ${rows.length}`);

    // Rilascia Resend e attendi che il fanout fire-and-forget completi.
    releaseEmails();
    const deadline = Date.now() + 5000;
    while (captured.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const recipients = captured.flatMap((e) => (Array.isArray(e.to) ? e.to : [e.to]));
    assert.deepEqual(
      recipients,
      [verifiedEmail],
      `attesa UNA sola email al solo membro verificato, ricevute: ${JSON.stringify(captured)}`,
    );
    assert.ok(!recipients.includes(authorEmail), "l'autore non deve mai ricevere l'email");
    assert.ok(!recipients.includes(unverifiedEmail), "email non verificata: escluso");
    assert.ok(!recipients.includes(blockedEmail), "block-related: escluso");
    assert.equal(captured.length, 1, "una sola email anche per la serie ricorrente");
    assert.match(captured[0]!.subject, /Nuovo evento in famiglia/);
  });
});
