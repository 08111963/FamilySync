import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, expenses } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di integrazione: un membro non può modificare/eliminare la spesa
 * registrata da un altro membro della stessa famiglia (403), mentre il
 * proprietario e l'admin possono. Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("ownership spese (PUT/DELETE)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[] };

  let familyId: string;
  let adminToken: string;
  let bobToken: string;
  let aliceToken: string;
  let bobMemberId: string;

  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function request(method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function makeUser(role: "admin" | "adult") {
    const [u] = await db.insert(users).values({
      email: `exp-${role}-${uniq()}@test.local`,
      passwordHash: "x".repeat(20),
      name: role,
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    const [m] = await db.insert(familyMembers).values({
      familyId,
      userId: u.id,
      name: role,
      role,
      color: "#3B82F6",
    }).returning();
    return { user: u, member: m, token: generateAccessToken(u) };
  }

  before(async () => {
    const app = express();
    app.use(express.json());
    await registerRoutes(app);
    server = app.listen(0);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    const [fam] = await db.insert(families).values({ name: `Fam-exp-${uniq()}` }).returning();
    created.families.push(fam.id);
    familyId = fam.id;

    const admin = await makeUser("admin");
    adminToken = admin.token;
    const bob = await makeUser("adult");
    bobToken = bob.token;
    bobMemberId = bob.member.id;
    const alice = await makeUser("adult");
    aliceToken = alice.token;
  });

  after(async () => {
    if (created.families.length) await db.delete(families).where(inArray(families.id, created.families));
    if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
    server?.close();
  });

  async function createBobExpense(): Promise<string> {
    const res = await request("POST", `/api/expenses/${familyId}`, {
      amount: 12.5,
      category: "alimentari",
      description: "spesa di Bob",
      date: "2026-08-18",
    }, bobToken);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.memberId, bobMemberId);
    return body.id as string;
  }

  test("un altro membro NON può modificare la spesa di Bob (403)", async () => {
    const id = await createBobExpense();
    const res = await request("PUT", `/api/expenses/${familyId}/${id}`, { amount: 1 }, aliceToken);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "FORBIDDEN");
  });

  test("un altro membro NON può eliminare la spesa di Bob (403)", async () => {
    const id = await createBobExpense();
    const res = await request("DELETE", `/api/expenses/${familyId}/${id}`, undefined, aliceToken);
    assert.equal(res.status, 403);
  });

  test("il proprietario può modificare ed eliminare la propria spesa", async () => {
    const id = await createBobExpense();
    const put = await request("PUT", `/api/expenses/${familyId}/${id}`, { amount: 20 }, bobToken);
    assert.equal(put.status, 200);
    const del = await request("DELETE", `/api/expenses/${familyId}/${id}`, undefined, bobToken);
    assert.equal(del.status, 200);
  });

  test("l'admin può modificare ed eliminare la spesa di Bob", async () => {
    const id = await createBobExpense();
    const put = await request("PUT", `/api/expenses/${familyId}/${id}`, { amount: 30 }, adminToken);
    assert.equal(put.status, 200);
    const del = await request("DELETE", `/api/expenses/${familyId}/${id}`, undefined, adminToken);
    assert.equal(del.status, 200);
  });

  test("spesa inesistente → 404 (non 403)", async () => {
    const res = await request("PUT", `/api/expenses/${familyId}/00000000-0000-0000-0000-000000000000`, { amount: 1 }, aliceToken);
    assert.equal(res.status, 404);
  });
});
