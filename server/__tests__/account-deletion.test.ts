import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  families,
  familyMembers,
  calendarEvents,
  pushTokens,
  blocks,
} from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE della cancellazione account contro il DB reale e l'app
 * Express completa. Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("cancellazione account (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[] };
  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function seedUser(email: string, plainPassword: string) {
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const [u] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
      name: email.split("@")[0],
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    return u;
  }

  async function seedFamily(name: string) {
    const [f] = await db.insert(families).values({ name }).returning();
    created.families.push(f.id);
    return f;
  }

  async function addMember(familyId: string, userId: string, role: "admin" | "adult" | "teen" | "child", joinedAt?: Date) {
    const [m] = await db.insert(familyMembers).values({
      familyId,
      userId,
      role,
      color: "#6366F1",
      ...(joinedAt ? { joinedAt } : {}),
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

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    Object.assign(process.env, { NODE_ENV: "test" });

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (created.families.length) {
      await db.delete(families).where(inArray(families.id, created.families));
    }
    if (created.users.length) {
      await db.delete(pushTokens).where(inArray(pushTokens.userId, created.users));
      await db.delete(users).where(inArray(users.id, created.users));
    }
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  // --- guardie HTTP -----------------------------------------------------------

  test("DELETE /account: senza autenticazione → 401", async () => {
    const res = await request("DELETE", "/api/auth/account", { password: "Qualsiasi123", confirmation: "ELIMINA" });
    assert.equal(res.status, 401);
  });

  test("DELETE /account: password errata → 400/401, account NON cancellato", async () => {
    const user = await seedUser(`del-wrongpw-${uniq()}@example.com`, "RightPass123");
    const token = generateAccessToken(user as any);

    const res = await request("DELETE", "/api/auth/account", { password: "WrongPass123", confirmation: "ELIMINA" }, token);
    assert.ok(res.status === 400 || res.status === 401, `atteso 400/401, ricevuto ${res.status}`);

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    assert.equal(row.deletedAt, null, "l'account non deve risultare cancellato");
  });

  test("DELETE /account: conferma errata → 400, account NON cancellato", async () => {
    const user = await seedUser(`del-wrongconf-${uniq()}@example.com`, "RightPass123");
    const token = generateAccessToken(user as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ANNULLA" }, token);
    assert.equal(res.status, 400);

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    assert.equal(row.deletedAt, null, "l'account non deve risultare cancellato");
  });

  // --- percorso felice --------------------------------------------------------

  test("DELETE /account: password+conferma corrette → anonimizzato, risposta senza dati sensibili, login impossibile", async () => {
    const email = `del-ok-${uniq()}@example.com`;
    const user = await seedUser(email, "RightPass123");
    const token = generateAccessToken(user as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);
    const body = await res.json();
    // La risposta non deve esporre dati sensibili.
    assert.equal(body.password, undefined);
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.email, undefined);

    // La riga è anonimizzata: deletedAt impostato, email/nome cambiati.
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    assert.ok(row.deletedAt, "deletedAt deve essere impostato");
    assert.notEqual(row.email, email.toLowerCase(), "l'email deve essere anonimizzata");
    assert.equal(row.name, "Utente eliminato");
    assert.equal(row.avatarUrl, null);

    // Login con la vecchia email non deve funzionare.
    const login = await request("POST", "/api/auth/login", { email, password: "RightPass123" });
    assert.equal(login.status, 401);
  });

  test("DELETE /account: i push token dell'utente vengono rimossi", async () => {
    const user = await seedUser(`del-push-${uniq()}@example.com`, "RightPass123");
    await db.insert(pushTokens).values({ userId: user.id, token: `tok-${uniq()}`, platform: "ios" });
    const token = generateAccessToken(user as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);

    const remaining = await db.select().from(pushTokens).where(eq(pushTokens.userId, user.id));
    assert.equal(remaining.length, 0, "i push token devono essere eliminati");
  });

  test("token revocato dopo la cancellazione: GET /me → 401", async () => {
    const user = await seedUser(`del-me-${uniq()}@example.com`, "RightPass123");
    const token = generateAccessToken(user as any);

    const before = await request("GET", "/api/auth/me", undefined, token);
    assert.equal(before.status, 200);

    const del = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(del.status, 200);

    const after = await request("GET", "/api/auth/me", undefined, token);
    assert.equal(after.status, 401, "l'account cancellato non deve più essere accessibile (revoca nel middleware)");
  });

  test("token revocato su QUALSIASI endpoint protetto: /api/families → 401", async () => {
    const user = await seedUser(`del-revoke-${uniq()}@example.com`, "RightPass123");
    const token = generateAccessToken(user as any);

    const before = await request("GET", "/api/families", undefined, token);
    assert.notEqual(before.status, 401, "prima della cancellazione il token deve essere valido");

    const del = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(del.status, 200);

    // Il middleware authenticate deve rifiutare immediatamente l'account cancellato.
    const after = await request("GET", "/api/families", undefined, token);
    assert.equal(after.status, 401, "dopo la cancellazione il token non deve funzionare su nessun endpoint protetto");
  });

  // --- gestione famiglie ------------------------------------------------------

  test("unico membro: la famiglia (e i contenuti) viene eliminata", async () => {
    const user = await seedUser(`del-sole-${uniq()}@example.com`, "RightPass123");
    const family = await seedFamily(`Sole ${uniq()}`);
    const member = await addMember(family.id, user.id, "admin");
    await db.insert(calendarEvents).values({
      familyId: family.id,
      title: "Evento",
      date: "2026-07-01",
      color: "#6366F1",
      memberId: member.id,
      createdBy: user.id,
    });
    const token = generateAccessToken(user as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);

    const fam = await db.select().from(families).where(eq(families.id, family.id));
    assert.equal(fam.length, 0, "la famiglia senza altri membri deve essere eliminata");
    const events = await db.select().from(calendarEvents).where(eq(calendarEvents.familyId, family.id));
    assert.equal(events.length, 0, "i contenuti della famiglia eliminata devono sparire (cascade)");
  });

  test("più membri: la famiglia sopravvive, i contenuti condivisi restano", async () => {
    const leaver = await seedUser(`del-multi-${uniq()}@example.com`, "RightPass123");
    const keeper = await seedUser(`keep-multi-${uniq()}@example.com`, "RightPass123");
    const family = await seedFamily(`Multi ${uniq()}`);
    await addMember(family.id, leaver.id, "adult");
    const keeperMember = await addMember(family.id, keeper.id, "admin");
    const [event] = await db.insert(calendarEvents).values({
      familyId: family.id,
      title: "Condiviso",
      date: "2026-07-02",
      color: "#6366F1",
      memberId: keeperMember.id,
      createdBy: leaver.id, // creato da chi se ne va
    }).returning();
    const token = generateAccessToken(leaver as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);

    const fam = await db.select().from(families).where(eq(families.id, family.id));
    assert.equal(fam.length, 1, "la famiglia con altri membri deve sopravvivere");
    const stillEvent = await db.select().from(calendarEvents).where(eq(calendarEvents.id, event.id));
    assert.equal(stillEvent.length, 1, "il contenuto condiviso deve restare");
    const leaverMembership = await db.select().from(familyMembers).where(eq(familyMembers.userId, leaver.id));
    assert.equal(leaverMembership.length, 0, "la membership di chi se ne va deve essere rimossa");
  });

  test("unico admin con altri membri: il ruolo admin viene trasferito al membro più anziano", async () => {
    const admin = await seedUser(`del-admin-${uniq()}@example.com`, "RightPass123");
    const older = await seedUser(`older-${uniq()}@example.com`, "RightPass123");
    const newer = await seedUser(`newer-${uniq()}@example.com`, "RightPass123");
    const family = await seedFamily(`Transfer ${uniq()}`);
    await addMember(family.id, admin.id, "admin", new Date("2026-01-01"));
    const olderMember = await addMember(family.id, older.id, "adult", new Date("2026-02-01"));
    await addMember(family.id, newer.id, "child", new Date("2026-03-01"));
    const token = generateAccessToken(admin as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);

    const [promoted] = await db.select().from(familyMembers).where(eq(familyMembers.id, olderMember.id));
    assert.equal(promoted.role, "admin", "il membro più anziano deve diventare admin");

    const admins = (await db.select().from(familyMembers).where(eq(familyMembers.familyId, family.id))).filter((m) => m.role === "admin");
    assert.equal(admins.length, 1, "la famiglia deve mantenere esattamente un admin");
  });

  test("i blocchi che coinvolgono l'utente vengono rimossi", async () => {
    const blocker = await seedUser(`blocker-${uniq()}@example.com`, "RightPass123");
    const blocked = await seedUser(`blocked-${uniq()}@example.com`, "RightPass123");
    const family = await seedFamily(`Block ${uniq()}`);
    await addMember(family.id, blocker.id, "admin");
    await addMember(family.id, blocked.id, "adult");
    await db.insert(blocks).values({ familyId: family.id, blockerUserId: blocker.id, blockedUserId: blocked.id });
    const token = generateAccessToken(blocker as any);

    const res = await request("DELETE", "/api/auth/account", { password: "RightPass123", confirmation: "ELIMINA" }, token);
    assert.equal(res.status, 200);

    const remaining = await db.select().from(blocks).where(eq(blocks.blockerUserId, blocker.id));
    assert.equal(remaining.length, 0, "i blocchi creati dall'utente devono essere rimossi");
  });
});
