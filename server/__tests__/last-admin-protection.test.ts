import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

const hasDb = !!process.env.DATABASE_URL;

// Protezione "ultimo admin": una famiglia non deve mai restare senza
// amministratori (né via cambio ruolo, né via rimozione del membro).
describe("protezione ultimo admin", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let adminToken: string;
  let adminMembershipId: string;
  let secondAdminMembershipId: string;
  let adultMembershipId: string;

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

  function request(method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

    const admin = await seedUser(`admin-${uniq()}@example.com`);
    adminToken = generateAccessToken(admin);
    const secondAdmin = await seedUser(`admin2-${uniq()}@example.com`);
    const adult = await seedUser(`adult-${uniq()}@example.com`);

    const [fam] = await db.insert(families).values({ name: "Fam LastAdmin", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);

    const [am] = await db.insert(familyMembers).values({
      familyId, userId: admin.id, role: "admin", nickname: "Admin", color: "#6366F1", points: 0,
    }).returning();
    adminMembershipId = am.id;
    const [am2] = await db.insert(familyMembers).values({
      familyId, userId: secondAdmin.id, role: "admin", nickname: "Admin2", color: "#6366F1", points: 0,
    }).returning();
    secondAdminMembershipId = am2.id;
    const [ad] = await db.insert(familyMembers).values({
      familyId, userId: adult.id, role: "adult", nickname: "Adulto", color: "#6366F1", points: 0,
    }).returning();
    adultMembershipId = ad.id;
  });

  after(async () => {
    try {
      if (created.families.length) await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
      if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("con 2 admin, uno PUÒ essere declassato (positivo)", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${secondAdminMembershipId}`, {
      role: "adult",
    }, adminToken);
    const text = await res.text();
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}: ${text}`);
    assert.equal(JSON.parse(text).role, "adult");
  });

  test("l'unico admin NON può declassare se stesso: 409 LAST_ADMIN", async () => {
    // Dopo il test precedente è rimasto un solo admin.
    const res = await request("PUT", `/api/families/${familyId}/members/${adminMembershipId}`, {
      role: "adult",
    }, adminToken);
    const body = await res.json();
    assert.equal(res.status, 409, `atteso 409, ricevuto ${res.status}`);
    assert.equal(body.error?.code, "LAST_ADMIN");
  });

  test("l'unico admin NON può essere rimosso: 409 LAST_ADMIN", async () => {
    const res = await request("DELETE", `/api/families/${familyId}/members/${adminMembershipId}`, undefined, adminToken);
    const body = await res.json();
    assert.equal(res.status, 409, `atteso 409, ricevuto ${res.status}`);
    assert.equal(body.error?.code, "LAST_ADMIN");
  });

  test("con 2 admin, uno PUÒ essere rimosso (positivo)", async () => {
    // Ripromuove il secondo membro ad admin, poi rimuove il primo.
    const promote = await request("PUT", `/api/families/${familyId}/members/${secondAdminMembershipId}`, {
      role: "admin",
    }, adminToken);
    assert.equal(promote.status, 200);

    const res = await request("DELETE", `/api/families/${familyId}/members/${adminMembershipId}`, undefined, adminToken);
    const text = await res.text();
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}: ${text}`);
  });

  test("due declassamenti CONCORRENTI non lasciano la famiglia senza admin", async () => {
    // Stato attuale: resta solo il secondo admin. Ricrea un secondo admin
    // così da avere di nuovo 2 admin, poi prova a declassarli in parallelo:
    // al massimo UNO dei due può riuscire (lock per-famiglia).
    const extra = await seedUser(`admin3-${uniq()}@example.com`);
    const [em] = await db.insert(familyMembers).values({
      familyId, userId: extra.id, role: "admin", nickname: "Admin3", color: "#6366F1", points: 0,
    }).returning();

    const [r1, r2] = await Promise.all([
      request("PUT", `/api/families/${familyId}/members/${secondAdminMembershipId}`, { role: "adult" }, generateAccessToken(extra)),
      request("PUT", `/api/families/${familyId}/members/${em.id}`, { role: "adult" }, generateAccessToken(extra)),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409], `attesi 200+409, ricevuti ${statuses.join(",")}`);

    const admins = await db.select().from(familyMembers)
      .where(inArray(familyMembers.familyId, [familyId]))
      .then((rows) => rows.filter((r) => r.role === "admin"));
    assert.equal(admins.length, 1, "deve restare esattamente un admin");

    // Ripristina 1 solo admin noto (il secondo) per i test successivi.
    await db.update(familyMembers).set({ role: "admin" })
      .where(inArray(familyMembers.id, [secondAdminMembershipId]));
    await db.delete(familyMembers).where(inArray(familyMembers.id, [em.id]));
  });

  test("un membro non-admin resta comunque escluso (403, non 409)", async () => {
    // L'adult non deve nemmeno arrivare al controllo LAST_ADMIN.
    const adultUser = created.users[2];
    const [u] = await db.select().from(users).where(inArray(users.id, [adultUser]));
    const token = generateAccessToken(u);
    const res = await request("DELETE", `/api/families/${familyId}/members/${secondAdminMembershipId}`, undefined, token);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });
});
