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

describe("profili bambino gestiti dai genitori (senza account/email)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let adminToken: string;
  let adultToken: string;
  let teenToken: string;

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
    const adult = await seedUser(`adult-${uniq()}@example.com`);
    adultToken = generateAccessToken(adult);
    const teen = await seedUser(`teen-${uniq()}@example.com`);
    teenToken = generateAccessToken(teen);

    const [fam] = await db.insert(families).values({ name: "Fam Child Test", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);

    await db.insert(familyMembers).values([
      { familyId, userId: admin.id, role: "admin", nickname: "Admin", color: "#6366F1", points: 0 },
      { familyId, userId: adult.id, role: "adult", nickname: "Genitore", color: "#10B981", points: 0 },
      { familyId, userId: teen.id, role: "teen", nickname: "Teen", color: "#F59E0B", points: 0 },
    ]);
  });

  after(async () => {
    try {
      if (created.families.length) await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
      if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  let childMemberId: string;

  test("un admin può creare un profilo bambino con solo il nome", async () => {
    const res = await request("POST", `/api/families/${familyId}/child-profiles`, { name: "Sofia" }, adminToken);
    const text = await res.text();
    assert.equal(res.status, 201, `atteso 201, ricevuto ${res.status}: ${text}`);
    const body = JSON.parse(text);
    assert.equal(body.userId, null);
    assert.equal(body.role, "child");
    assert.equal(body.name, "Sofia");
    childMemberId = body.id;
  });

  test("anche un adult può creare un profilo bambino", async () => {
    const res = await request("POST", `/api/families/${familyId}/child-profiles`, { name: "Luca" }, adultToken);
    assert.equal(res.status, 201, `atteso 201, ricevuto ${res.status}`);
  });

  test("un teen NON può creare un profilo bambino", async () => {
    const res = await request("POST", `/api/families/${familyId}/child-profiles`, { name: "Nope" }, teenToken);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });

  test("nome troppo corto -> 400", async () => {
    const res = await request("POST", `/api/families/${familyId}/child-profiles`, { name: "A" }, adminToken);
    assert.equal(res.status, 400, `atteso 400, ricevuto ${res.status}`);
  });

  test("il profilo bambino compare nella lista membri (userId null, isManagedProfile)", async () => {
    const res = await request("GET", `/api/families/${familyId}`, undefined, adminToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    const child = body.members.find((m: any) => m.id === childMemberId);
    assert.ok(child, "profilo bambino assente dalla lista membri");
    assert.equal(child.userId, null);
    assert.equal(child.name, "Sofia");
    assert.equal(child.isManagedProfile, true);
    // I membri con account restano intatti
    const adminMember = body.members.find((m: any) => m.role === "admin");
    assert.ok(adminMember?.userId, "membro con account senza userId");
  });

  test("un adult può rinominare il profilo bambino", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${childMemberId}`, { name: "Sofia Maria", color: "#EF4444" }, adultToken);
    const text = await res.text();
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}: ${text}`);
    const body = JSON.parse(text);
    assert.equal(body.name, "Sofia Maria");
  });

  test("un teen NON può modificare il profilo bambino", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${childMemberId}`, { color: "#000000" }, teenToken);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });

  test("un teen NON può eliminare il profilo bambino", async () => {
    const res = await request("DELETE", `/api/families/${familyId}/members/${childMemberId}`, undefined, teenToken);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });

  test("un adult può eliminare il profilo bambino (ma non un membro con account)", async () => {
    // adult NON può rimuovere un membro con account
    const resList = await request("GET", `/api/families/${familyId}`, undefined, adminToken);
    const members = (await resList.json()).members;
    const teenMember = members.find((m: any) => m.role === "teen");
    const resDenied = await request("DELETE", `/api/families/${familyId}/members/${teenMember.id}`, undefined, adultToken);
    assert.equal(resDenied.status, 403, `atteso 403, ricevuto ${resDenied.status}`);

    // adult PUÒ rimuovere il profilo bambino
    const res = await request("DELETE", `/api/families/${familyId}/members/${childMemberId}`, undefined, adultToken);
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}`);
  });
});
