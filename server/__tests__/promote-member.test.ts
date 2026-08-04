import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, familyInvites, entitlements } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE del flusso "promuovi profilo bambino": un invito email
 * legato a un familyMembers esistente (userId NULL) che, all'accettazione,
 * COLLEGA l'account al membro esistente preservando punti e storico.
 * Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("promozione profilo bambino -> account (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[] };

  let adminId: string;
  let adminToken: string;
  let familyId: string;
  let teenToken: string;

  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function seedUser(email: string, emailVerified = true) {
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

  async function seedChildProfile(fid: string, name: string, points = 0) {
    const [m] = await db.insert(familyMembers).values({
      familyId: fid, userId: null, role: "child", name, nickname: name, color: "#F59E0B", points,
    }).returning();
    return m;
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

  function tokenFromLink(link: string): string {
    return link.split("/join/")[1];
  }

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    delete process.env.RESEND_API_KEY; // email non configurata (dev: invito creato comunque)

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const admin = await seedUser(`padmin-${uniq()}@example.com`);
    adminId = admin.id;
    adminToken = generateAccessToken(admin);

    const [fam] = await db.insert(families).values({ name: "Famiglia Promo", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);
    await db.insert(familyMembers).values({
      familyId, userId: adminId, role: "admin", nickname: "n", color: "#6366F1", points: 0,
    });

    // teen con account: NON deve poter promuovere
    const teen = await seedUser(`pteen-${uniq()}@example.com`);
    teenToken = generateAccessToken(teen);
    await db.insert(familyMembers).values({
      familyId, userId: teen.id, role: "teen", nickname: "t", color: "#6366F1", points: 0,
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const fid of created.families) {
      await db.delete(familyInvites).where(eq(familyInvites.familyId, fid));
      await db.delete(entitlements).where(eq(entitlements.familyId, fid));
      await db.delete(familyMembers).where(eq(familyMembers.familyId, fid));
      await db.delete(families).where(eq(families.id, fid));
    }
    for (const uid of created.users) {
      await db.delete(familyMembers).where(eq(familyMembers.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
  });

  test("solo un genitore (admin/adult) può promuovere: teen -> 403", async () => {
    const child = await seedChildProfile(familyId, "Sofia");
    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${child.id}/promote`,
      { email: `sofia-${uniq()}@example.com` },
      teenToken,
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "FORBIDDEN");
  });

  test("membro già collegato a un account -> 409 ALREADY_LINKED", async () => {
    const linked = await seedUser(`linked-${uniq()}@example.com`);
    const [m] = await db.insert(familyMembers).values({
      familyId, userId: linked.id, role: "adult", nickname: "l", color: "#6366F1", points: 0,
    }).returning();
    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${m.id}/promote`,
      { email: `whatever-${uniq()}@example.com` },
      adminToken,
    );
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "ALREADY_LINKED");
  });

  test("email di un membro già in famiglia -> 409 ALREADY_MEMBER", async () => {
    const child = await seedChildProfile(familyId, "Gino");
    const existing = await seedUser(`inFam-${uniq()}@example.com`);
    await db.insert(familyMembers).values({
      familyId, userId: existing.id, role: "adult", nickname: "e", color: "#6366F1", points: 0,
    });
    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${child.id}/promote`,
      { email: existing.email },
      adminToken,
    );
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "ALREADY_MEMBER");
  });

  test("flusso completo NUOVO utente: invito legato al membro, accept collega account e preserva punti", async () => {
    const child = await seedChildProfile(familyId, "Luca", 123);
    const email = `luca-${uniq()}@example.com`;

    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${child.id}/promote`,
      { email },
      adminToken,
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.inviteLink, "inviteLink presente in dev");

    // invito nel DB legato al membro, ruolo = quello del profilo (child)
    const [invite] = await db.select().from(familyInvites).where(eq(familyInvites.email, email)).limit(1);
    assert.equal(invite.memberId, child.id);
    assert.equal(invite.role, "child");

    // GET pubblico segnala la promozione
    const token = tokenFromLink(data.inviteLink);
    const look = await (await request("GET", `/api/invites/${token}`)).json();
    assert.equal(look.isPromotion, true);

    const membersBefore = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const acc = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(acc.status, 201);
    const out = await acc.json();
    created.users.push(out.user.id);

    // NESSUN nuovo membro: stesso record collegato all'account
    const membersAfter = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    assert.equal(membersAfter.length, membersBefore.length, "la promozione non aggiunge membri");

    const [linked] = await db.select().from(familyMembers).where(eq(familyMembers.id, child.id)).limit(1);
    assert.equal(linked.userId, out.user.id, "account collegato al membro esistente");
    assert.equal(linked.points, 123, "punti preservati");
    assert.equal(linked.role, "child", "ruolo invariato");

    // token monouso
    const acc2 = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(acc2.status, 409);
  });

  test("flusso utente ESISTENTE: join collega il membro senza crearne uno nuovo", async () => {
    const child = await seedChildProfile(familyId, "Anna", 55);
    const existing = await seedUser(`anna-${uniq()}@example.com`);
    const existingToken = generateAccessToken(existing);

    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${child.id}/promote`,
      { email: existing.email },
      adminToken,
    );
    assert.equal(res.status, 200);
    const token = tokenFromLink((await res.json()).inviteLink);

    const membersBefore = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));

    const join = await request("POST", `/api/families/join/${token}`, {}, existingToken);
    assert.equal(join.status, 200);

    const membersAfter = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    assert.equal(membersAfter.length, membersBefore.length, "nessun nuovo membro");

    const [linked] = await db.select().from(familyMembers).where(eq(familyMembers.id, child.id)).limit(1);
    assert.equal(linked.userId, existing.id);
    assert.equal(linked.points, 55, "punti preservati");
  });

  test("piano Free al limite: la promozione passa comunque (non aggiunge membri)", async () => {
    // Famiglia FREE (nessun entitlement) con 5 membri: 4 con account + 1 profilo bambino.
    const fAdmin = await seedUser(`fadmin-${uniq()}@example.com`);
    const fAdminToken = generateAccessToken(fAdmin);
    const [fFam] = await db.insert(families).values({ name: "Free Promo", colorTheme: "#6366F1" }).returning();
    created.families.push(fFam.id);
    await db.insert(familyMembers).values({
      familyId: fFam.id, userId: fAdmin.id, role: "admin", nickname: "a", color: "#6366F1", points: 0,
    });
    for (let i = 0; i < 3; i++) {
      const m = await seedUser(`fm${i}-${uniq()}@example.com`);
      await db.insert(familyMembers).values({
        familyId: fFam.id, userId: m.id, role: "adult", nickname: "m", color: "#6366F1", points: 0,
      });
    }
    const child = await seedChildProfile(fFam.id, "Pieno", 9);

    const res = await request(
      "POST",
      `/api/families/${fFam.id}/members/${child.id}/promote`,
      { email: `pieno-${uniq()}@example.com` },
      fAdminToken,
    );
    assert.equal(res.status, 200, "promozione consentita anche a famiglia al limite");
    const token = tokenFromLink((await res.json()).inviteLink);

    const acc = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(acc.status, 201, "accept passa: il membro conta già nel totale");
    const out = await acc.json();
    created.users.push(out.user.id);

    const [linked] = await db.select().from(familyMembers).where(eq(familyMembers.id, child.id)).limit(1);
    assert.equal(linked.userId, out.user.id);
  });

  test("profilo eliminato dopo l'invito -> 409 PROFILE_GONE e rollback (niente account orfano)", async () => {
    const child = await seedChildProfile(familyId, "Gone");
    const email = `gone-${uniq()}@example.com`;
    const res = await request(
      "POST",
      `/api/families/${familyId}/members/${child.id}/promote`,
      { email },
      adminToken,
    );
    assert.equal(res.status, 200);
    const token = tokenFromLink((await res.json()).inviteLink);

    // Il genitore elimina il profilo prima dell'accettazione: l'invito viene
    // rimosso a cascata (FK ON DELETE CASCADE) => accept -> 404.
    await db.delete(familyMembers).where(eq(familyMembers.id, child.id));

    const acc = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.ok([404, 409].includes(acc.status), `atteso 404/409, ricevuto ${acc.status}`);

    // rollback: nessun account creato
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    assert.equal(u, undefined, "nessun account orfano creato");
  });

  test("nessun profilo bambino orfano collegabile due volte: dopo il collegamento il membro non è più userId NULL", async () => {
    const orphans = await db.select().from(familyMembers)
      .where(and(eq(familyMembers.familyId, familyId), isNull(familyMembers.userId), eq(familyMembers.name, "Luca")));
    assert.equal(orphans.length, 0, "il profilo promosso non risulta più senza account");
  });
});
