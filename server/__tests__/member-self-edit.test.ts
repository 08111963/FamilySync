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

describe("membro non-admin modifica il proprio profilo", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let adminId: string;
  let memberUserId: string;
  let memberToken: string;
  let memberMembershipId: string;
  let adminMembershipId: string;

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
    adminId = admin.id;
    const member = await seedUser(`member-${uniq()}@example.com`);
    memberUserId = member.id;
    memberToken = generateAccessToken(member);

    const [fam] = await db.insert(families).values({ name: "Fam Test", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);

    const [am] = await db.insert(familyMembers).values({
      familyId, userId: adminId, role: "admin", nickname: "Admin", color: "#6366F1", points: 0,
    }).returning();
    adminMembershipId = am.id;
    const [mm] = await db.insert(familyMembers).values({
      familyId, userId: memberUserId, role: "adult", nickname: "Membro", color: "#6366F1", points: 0,
    }).returning();
    memberMembershipId = mm.id;
  });

  after(async () => {
    try {
      if (created.families.length) await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
      if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("un membro non-admin PUÒ cambiare colore e nickname del proprio profilo", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${memberMembershipId}`, {
      color: "#10B981", nickname: "Mario",
    }, memberToken);
    const text = await res.text();
    assert.equal(res.status, 200, `atteso 200, ricevuto ${res.status}: ${text}`);
    const body = JSON.parse(text);
    assert.equal(body.color, "#10B981");
    assert.equal(body.nickname, "Mario");
  });

  test("un membro non-admin NON può modificare il profilo di un altro membro", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${adminMembershipId}`, {
      color: "#EF4444",
    }, memberToken);
    assert.equal(res.status, 403, `atteso 403, ricevuto ${res.status}`);
  });

  test("un membro non-admin che invia solo role riceve 400 (nessuna modifica), non 500", async () => {
    const res = await request("PUT", `/api/families/${familyId}/members/${memberMembershipId}`, {
      role: "admin",
    }, memberToken);
    assert.equal(res.status, 400, `atteso 400, ricevuto ${res.status}`);
  });
});
