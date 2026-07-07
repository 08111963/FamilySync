import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, familyInvites, entitlements } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE del flusso di invito sicuro contro il DB reale e l'app
 * Express completa (auth, rate limit, router pubblico inviti). Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("flusso invito sicuro (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[], invites: [] as string[] };

  // attori
  let adminId: string;
  let adminToken: string;
  let familyId: string;

  let memberId: string; // membro non-admin
  let memberToken: string;

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

  async function addMembership(fid: string, uid: string, role: "admin" | "adult" | "teen" | "child") {
    await db.insert(familyMembers).values({
      familyId: fid, userId: uid, role, nickname: "n", color: "#6366F1", points: 0,
    });
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
    delete process.env.RESEND_API_KEY; // assicura email non configurata

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const admin = await seedUser(`admin-${uniq()}@example.com`, true);
    adminId = admin.id;
    adminToken = generateAccessToken(admin);

    const [fam] = await db.insert(families).values({ name: "Famiglia Test", colorTheme: "#6366F1" }).returning();
    familyId = fam.id;
    created.families.push(fam.id);
    await addMembership(familyId, adminId, "admin");

    // La famiglia del flusso invito è Premium: questi test verificano la
    // sicurezza del flusso (email-mismatch, token scaduto, ecc.), NON il limite
    // membri del piano Free. Premium => membri illimitati.
    await db.insert(entitlements).values({
      familyId,
      userId: adminId,
      platform: "revenuecat",
      productId: "familysync_premium_yearly",
      status: "active",
    });

    const member = await seedUser(`member-${uniq()}@example.com`, true);
    memberId = member.id;
    memberToken = generateAccessToken(member);
    await addMembership(familyId, memberId, "adult");
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // pulizia: gli inviti e i membri vengono rimossi a cascata con le famiglie
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

  async function createInvite(email: string, role = "adult", invitedName?: string) {
    const res = await request("POST", `/api/families/${familyId}/invite`, { email, role, invitedName }, adminToken);
    const data = await res.json();
    return { res, data };
  }

  function tokenFromLink(link: string): string {
    return link.split("/join/")[1];
  }

  test("solo un admin può invitare (membro non-admin -> 403)", async () => {
    const res = await request("POST", `/api/families/${familyId}/invite`, { email: `x-${uniq()}@example.com` }, memberToken);
    assert.equal(res.status, 403);
  });

  test("invito creato: nessuna password nella risposta e token salvato come hash", async () => {
    const email = `new-${uniq()}@example.com`;
    const { res, data } = await createInvite(email, "adult", "Marco");
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.email, email);

    const raw = JSON.stringify(data).toLowerCase();
    assert.ok(!raw.includes("password"), "la risposta non deve contenere password");
    assert.ok(!raw.includes("temppassword"), "la risposta non deve contenere tempPassword");

    // in dev il link è incluso: estraggo il token in chiaro
    assert.ok(data.inviteLink, "inviteLink presente in dev");
    const token = tokenFromLink(data.inviteLink);
    const expectedHash = createHash("sha256").update(token).digest("hex");

    const [row] = await db.select().from(familyInvites).where(eq(familyInvites.email, email)).limit(1);
    assert.ok(row, "invito salvato");
    assert.equal(row.tokenHash, expectedHash, "nel DB c'è l'hash, non il token in chiaro");
    assert.notEqual(row.tokenHash, token, "il token in chiaro NON è salvato");
    assert.equal(row.acceptedAt, null);
  });

  test("GET stato pubblico: valido, userExists=false, niente dati sensibili", async () => {
    const email = `lookup-${uniq()}@example.com`;
    const { data } = await createInvite(email);
    const token = tokenFromLink(data.inviteLink);

    const res = await request("GET", `/api/invites/${token}`);
    const info = await res.json();
    assert.equal(res.status, 200);
    assert.equal(info.status, "valid");
    assert.equal(info.email, email);
    assert.equal(info.userExists, false);
    const raw = JSON.stringify(info).toLowerCase();
    assert.ok(!raw.includes("tokenhash") && !raw.includes("password"));
  });

  test("accept NON registrato: crea account emailVerified=true + auto-login, niente password in risposta", async () => {
    const email = `accept-${uniq()}@example.com`;
    const { data } = await createInvite(email, "teen", "Giulia");
    const token = tokenFromLink(data.inviteLink);

    const res = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    const out = await res.json();
    assert.equal(res.status, 201);
    assert.ok(out.accessToken && out.refreshToken, "auto-login tokens presenti");
    assert.equal(out.user.email, email);
    assert.equal(out.user.emailVerified, true);

    const raw = JSON.stringify(out).toLowerCase();
    assert.ok(!raw.includes("\"password\"") && !raw.includes("passwordhash"));

    // utente in DB verificato, membro della famiglia, e consenso registrato
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    created.users.push(u.id);
    assert.equal(u.emailVerified, true);
    assert.ok(u.termsAcceptedAt instanceof Date, "termsAcceptedAt valorizzato dopo consenso esplicito");
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.userId, u.id)).limit(1);
    assert.ok(m, "membership creata");
    assert.equal(m.role, "teen");

    // token monouso: secondo accept bloccato
    const res2 = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(res2.status, 409);
  });

  test("password debole rifiutata (validazione)", async () => {
    const email = `weak-${uniq()}@example.com`;
    const { data } = await createInvite(email);
    const token = tokenFromLink(data.inviteLink);
    const res = await request("POST", `/api/invites/${token}/accept`, { password: "weak", acceptedTerms: true });
    assert.equal(res.status, 400);
  });

  test("accept SENZA acceptedTerms -> 400 TERMS_REQUIRED e nessun account creato", async () => {
    const email = `noterms-${uniq()}@example.com`;
    const { data } = await createInvite(email);
    const token = tokenFromLink(data.inviteLink);

    // assente
    const res = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12" });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "TERMS_REQUIRED");

    // esplicitamente false
    const resFalse = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: false });
    assert.equal(resFalse.status, 400);
    assert.equal((await resFalse.json()).error.code, "TERMS_REQUIRED");

    // nessun utente creato e invito ancora valido (non consumato)
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    assert.equal(u, undefined, "nessun account deve essere creato senza consenso");
    const look = await (await request("GET", `/api/invites/${token}`)).json();
    assert.equal(look.status, "valid");
  });

  test("accept CON acceptedTerms=true crea account e valorizza termsAcceptedAt; niente password in risposta", async () => {
    const email = `withterms-${uniq()}@example.com`;
    const { data } = await createInvite(email, "adult", "Luca");
    const token = tokenFromLink(data.inviteLink);

    const res = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(res.status, 201);
    const out = await res.json();
    const raw = JSON.stringify(out).toLowerCase();
    assert.ok(!raw.includes("\"password\"") && !raw.includes("passwordhash"), "nessuna password nella risposta");

    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    created.users.push(u.id);
    assert.ok(u, "account creato");
    assert.ok(u.termsAcceptedAt instanceof Date, "termsAcceptedAt valorizzato solo dopo consenso esplicito");
  });

  test("accept con email GIÀ registrata -> USER_EXISTS; accetta da loggato via join", async () => {
    // utente registrato e verificato (il router /api/families richiede email verificata)
    const existing = await seedUser(`existing-${uniq()}@example.com`, true);
    const existingToken = generateAccessToken(existing);
    const { data } = await createInvite(existing.email);
    const token = tokenFromLink(data.inviteLink);

    // GET segnala userExists
    const look = await (await request("GET", `/api/invites/${token}`)).json();
    assert.equal(look.userExists, true);

    // accept pubblico deve rifiutare (l'utente esiste già)
    const acc = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(acc.status, 409);

    // join da loggato (email coincide) -> ok
    const join = await request("POST", `/api/families/join/${token}`, {}, existingToken);
    assert.equal(join.status, 200);

    // il join non altera lo stato dell'account esistente
    const [u] = await db.select().from(users).where(eq(users.id, existing.id)).limit(1);
    assert.equal(u.emailVerified, true);

    // token monouso: secondo join bloccato
    const join2 = await request("POST", `/api/families/join/${token}`, {}, existingToken);
    assert.equal(join2.status, 409);
  });

  test("EMAIL_MISMATCH: utente loggato con email diversa non può accettare", async () => {
    const invitedEmail = `target-${uniq()}@example.com`;
    const { data } = await createInvite(invitedEmail);
    const token = tokenFromLink(data.inviteLink);

    const other = await seedUser(`other-${uniq()}@example.com`, true);
    const otherToken = generateAccessToken(other);

    const res = await request("POST", `/api/families/join/${token}`, {}, otherToken);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "EMAIL_MISMATCH");
  });

  test("token scaduto bloccato (GET, accept, join)", async () => {
    const email = `expired-${uniq()}@example.com`;
    const { data } = await createInvite(email);
    const token = tokenFromLink(data.inviteLink);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // forzo scadenza nel passato
    await db.update(familyInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(familyInvites.tokenHash, tokenHash));

    const look = await (await request("GET", `/api/invites/${token}`)).json();
    assert.equal(look.status, "expired");

    // con consenso valido, deve bloccare per scadenza (non per termini)
    const acc = await request("POST", `/api/invites/${token}/accept`, { password: "Abcdef12", acceptedTerms: true });
    assert.equal(acc.status, 400);
    assert.equal((await acc.json()).error.code, "INVITE_EXPIRED");
  });

  test("piano Free: invito bloccato al 6° membro (MEMBER_LIMIT_REACHED)", async () => {
    // Famiglia FREE dedicata (nessun entitlement) con 5 membri già presenti.
    const freeAdmin = await seedUser(`free-admin-${uniq()}@example.com`, true);
    const freeAdminToken = generateAccessToken(freeAdmin);
    const [freeFam] = await db.insert(families).values({ name: "Famiglia Free", colorTheme: "#6366F1" }).returning();
    created.families.push(freeFam.id);
    await addMembership(freeFam.id, freeAdmin.id, "admin");
    // aggiungo altri 4 membri => 5 in totale (limite Free)
    for (let i = 0; i < 4; i++) {
      const m = await seedUser(`free-m${i}-${uniq()}@example.com`, true);
      await addMembership(freeFam.id, m.id, "adult");
    }

    const res = await request(
      "POST",
      `/api/families/${freeFam.id}/invite`,
      { email: `sesto-${uniq()}@example.com` },
      freeAdminToken,
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "MEMBER_LIMIT_REACHED");
  });

  test("piano Free: due join concorrenti sull'ultimo posto -> solo uno passa (guardia atomica)", async () => {
    const cAdmin = await seedUser(`conc-admin-${uniq()}@example.com`, true);
    const [cFam] = await db.insert(families).values({ name: "Famiglia Conc", colorTheme: "#6366F1" }).returning();
    created.families.push(cFam.id);
    await addMembership(cFam.id, cAdmin.id, "admin");
    // 3 membri extra => 4 totali, resta UN solo posto libero (limite 5)
    for (let i = 0; i < 3; i++) {
      const m = await seedUser(`conc-m${i}-${uniq()}@example.com`, true);
      await addMembership(cFam.id, m.id, "adult");
    }

    const makeInviteFor = async (email: string) => {
      const raw = `${uniq()}${Math.random().toString(36).slice(2)}`;
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      await db.insert(familyInvites).values({
        familyId: cFam.id,
        email: email.toLowerCase(),
        role: "adult",
        tokenHash,
        invitedBy: cAdmin.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      return raw;
    };

    const uA = await seedUser(`conc-joinA-${uniq()}@example.com`, true);
    const uB = await seedUser(`conc-joinB-${uniq()}@example.com`, true);
    const tokenA = await makeInviteFor(uA.email);
    const tokenB = await makeInviteFor(uB.email);

    // Due join in PARALLELO: solo uno può occupare l'ultimo posto.
    const [rA, rB] = await Promise.all([
      request("POST", `/api/families/join/${tokenA}`, {}, generateAccessToken(uA)),
      request("POST", `/api/families/join/${tokenB}`, {}, generateAccessToken(uB)),
    ]);

    const statuses = [rA.status, rB.status].sort();
    assert.deepEqual(statuses, [200, 403], "esattamente un join deve passare, l'altro bloccato");
    const failed = rA.status === 403 ? rA : rB;
    assert.equal((await failed.json()).error.code, "MEMBER_LIMIT_REACHED");

    // La famiglia deve avere ESATTAMENTE 5 membri (limite non superato).
    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, cFam.id));
    assert.equal(cnt.n, 5, "il limite di 5 membri non deve essere superato");
  });

  test("in PRODUZIONE senza email configurata: 503 EMAIL_NOT_CONFIGURED e nessun invito creato", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    try {
      const email = `prod-${uniq()}@example.com`;
      const res = await request("POST", `/api/families/${familyId}/invite`, { email }, adminToken);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error.code, "EMAIL_NOT_CONFIGURED");

      const [row] = await db.select().from(familyInvites).where(eq(familyInvites.email, email)).limit(1);
      assert.equal(row, undefined, "nessun invito deve essere creato");
    } finally {
      env.NODE_ENV = prev;
    }
  });
});
