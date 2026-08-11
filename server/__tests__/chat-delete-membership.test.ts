import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, chatMessages } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

const hasDb = !!process.env.DATABASE_URL;

// DELETE messaggio chat: chi non è (più) membro della famiglia non deve poter
// cancellare messaggi, nemmeno quelli scritti da lui (token ancora valido).
describe("DELETE messaggio chat richiede appartenenza alla famiglia", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let authorToken: string;
  let authorId: string;
  let authorMembershipId: string;
  let messageId: string;

  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function seedUser(email: string) {
    const [u] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash: "x".repeat(20),
      name: email.split("@")[0],
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    return u;
  }

  function request(method: string, path: string, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { method, headers });
  }

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const author = await seedUser(`author-${uniq()}@example.com`);
    authorId = author.id;
    authorToken = generateAccessToken(author);

    const [fam] = await db.insert(families).values({ name: "Fam ChatDel", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);

    const [m] = await db.insert(familyMembers).values({
      familyId, userId: authorId, role: "adult", nickname: "Autore", color: "#6366F1", points: 0,
    }).returning();
    authorMembershipId = m.id;

    const [msg] = await db.insert(chatMessages).values({
      familyId, userId: authorId, content: "messaggio di prova",
    }).returning();
    messageId = msg.id;
  });

  after(async () => {
    try {
      if (created.families.length) await db.delete(chatMessages).where(inArray(chatMessages.familyId, created.families));
      if (created.families.length) await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
      if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("l'autore rimosso dalla famiglia riceve 403 e il messaggio resta", async () => {
    // Simula la rimozione da parte di un admin: la membership sparisce ma
    // l'access token dell'utente resta valido fino alla scadenza.
    await db.delete(familyMembers).where(inArray(familyMembers.id, [authorMembershipId]));

    const res = await request("DELETE", `/api/chat/${familyId}/messages/${messageId}`, authorToken);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);

    const [still] = await db.select().from(chatMessages).where(inArray(chatMessages.id, [messageId]));
    assert.ok(still, "il messaggio non deve essere stato cancellato");
  });

  test("un utente mai stato membro riceve 403", async () => {
    const outsider = await seedUser(`outsider-${uniq()}@example.com`);
    const res = await request("DELETE", `/api/chat/${familyId}/messages/${messageId}`, generateAccessToken(outsider));
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });

  test("l'autore ancora membro PUÒ cancellare il proprio messaggio (positivo)", async () => {
    // Ripristina la membership e verifica che il flusso normale funzioni.
    await db.insert(familyMembers).values({
      familyId, userId: authorId, role: "adult", nickname: "Autore", color: "#6366F1", points: 0,
    });
    const res = await request("DELETE", `/api/chat/${familyId}/messages/${messageId}`, authorToken);
    const text = await res.text();
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}: ${text}`);
  });
});
