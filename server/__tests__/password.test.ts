import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, passwordResetTokens, emailVerificationTokens } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";
import { generateResetToken, hashResetToken } from "../lib/reset-token";
import { sendPasswordResetEmail } from "../lib/email";

/**
 * Test di INTEGRAZIONE della gestione password (forgot/reset/change) contro il
 * DB reale e l'app Express completa. Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("gestione password (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[] };
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

  async function seedResetToken(userId: string, rawToken: string, expiresAt: Date) {
    await db.insert(passwordResetTokens).values({
      userId,
      token: hashResetToken(rawToken),
      expiresAt,
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
    Object.assign(process.env, { NODE_ENV: "test" }); // disattiva il rate limiter dedicato e forza non-produzione
    delete process.env.SENDGRID_API_KEY;

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
    for (const id of created.users) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  // --- request-password-reset -------------------------------------------------

  test("request-password-reset: email esistente → messaggio generico e token HASHATO salvato", async () => {
    const user = await seedUser(`forgot-${uniq()}@example.com`, "OldPass123");
    const res = await request("POST", "/api/auth/request-password-reset", { email: user.email });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /email esiste/i);
    assert.equal(body.password, undefined);
    assert.equal(body.token, undefined);

    const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(rows.length, 1, "deve esistere un solo token per utente");
    // Il token salvato è un hash SHA-256 (64 hex), mai il valore in chiaro.
    assert.match(rows[0].token, /^[a-f0-9]{64}$/);
  });

  test("request-password-reset: email inesistente → stesso messaggio generico, nessun token", async () => {
    const ghost = `ghost-${uniq()}@example.com`;
    const res = await request("POST", "/api/auth/request-password-reset", { email: ghost });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /email esiste/i);

    const [u] = await db.select().from(users).where(eq(users.email, ghost)).limit(1);
    assert.equal(u, undefined);
  });

  test("request-password-reset: una nuova richiesta sostituisce il token precedente", async () => {
    const user = await seedUser(`forgot2-${uniq()}@example.com`, "OldPass123");
    await request("POST", "/api/auth/request-password-reset", { email: user.email });
    const first = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    await request("POST", "/api/auth/request-password-reset", { email: user.email });
    const second = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(second.length, 1, "deve restare un solo token valido");
    assert.notEqual(first[0].token, second[0].token, "il token deve essere rigenerato");
  });

  // --- produzione: email + CLIENT_URL obbligatori ----------------------------

  // Imposta env di produzione per il singolo test e ripristina sempre lo stato
  // di test (non-produzione, nessuna email/url configurati) nel finally.
  async function withProdEnv(
    env: { sendgrid?: string; clientUrl?: string },
    fn: () => Promise<void>,
  ) {
    Object.assign(process.env, { NODE_ENV: "production" });
    if (env.sendgrid) process.env.SENDGRID_API_KEY = env.sendgrid;
    else delete process.env.SENDGRID_API_KEY;
    if (env.clientUrl) process.env.CLIENT_URL = env.clientUrl;
    else delete process.env.CLIENT_URL;
    try {
      await fn();
    } finally {
      Object.assign(process.env, { NODE_ENV: "test" });
      delete process.env.SENDGRID_API_KEY;
      delete process.env.CLIENT_URL;
    }
  }

  test("produzione + SendGrid presente ma CLIENT_URL mancante → EMAIL_NOT_CONFIGURED", async () => {
    const user = await seedUser(`prod1-${uniq()}@example.com`, "OldPass123");
    await withProdEnv({ sendgrid: "SG.test-key" }, async () => {
      const res = await request("POST", "/api/auth/request-password-reset", { email: user.email });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error.code, "EMAIL_NOT_CONFIGURED");
    });
    // La guardia scatta PRIMA di toccare il DB: nessun token deve essere creato.
    const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(rows.length, 0);
  });

  test("produzione + SendGrid mancante → EMAIL_NOT_CONFIGURED", async () => {
    const user = await seedUser(`prod2-${uniq()}@example.com`, "OldPass123");
    await withProdEnv({ clientUrl: "https://app.example.com" }, async () => {
      const res = await request("POST", "/api/auth/request-password-reset", { email: user.email });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error.code, "EMAIL_NOT_CONFIGURED");
    });
    const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(rows.length, 0);
  });

  test("produzione + SendGrid e CLIENT_URL presenti → procede (nessun errore di configurazione)", async () => {
    // Email inesistente: la guardia di configurazione viene superata e si arriva
    // alla risposta generica, senza alcun tentativo reale di invio (nessun enumeration).
    const ghost = `prod3-${uniq()}@example.com`;
    await withProdEnv({ sendgrid: "SG.test-key", clientUrl: "https://app.example.com" }, async () => {
      const res = await request("POST", "/api/auth/request-password-reset", { email: ghost });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.match(body.message, /email esiste/i);
    });
  });

  // --- verifica email: stessa regola di configurazione in produzione ----------

  test("signup in produzione con email non configurata → NON blocca (utente creato, email saltata)", async () => {
    const email = `signup-prod-${uniq()}@example.com`;
    await withProdEnv({}, async () => {
      const res = await request("POST", "/api/auth/signup", {
        email,
        password: "StrongPass123",
        name: "Test Prod",
        acceptedTerms: true,
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.user.emailVerified, false);
      assert.equal(body.user.password, undefined);
      assert.equal(body.user.passwordHash, undefined);
    });
    // cleanup: rimuovi eventuali token di verifica così after() può eliminare l'utente
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    assert.ok(u, "l'utente deve essere stato creato nonostante l'email non configurata");
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, u.id));
    created.users.push(u.id);
  });

  test("resend-verification-email in produzione con email non configurata → EMAIL_NOT_CONFIGURED", async () => {
    const [u] = await db.insert(users).values({
      email: `resend-prod-${uniq()}@example.com`,
      passwordHash: await bcrypt.hash("OldPass123", 10),
      name: "Resend Prod",
      emailVerified: false,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    const token = generateAccessToken(u as any);

    await withProdEnv({}, async () => {
      const res = await request("POST", "/api/auth/resend-verification-email", {}, token);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error.code, "EMAIL_NOT_CONFIGURED");
    });
  });

  // --- reset-password ---------------------------------------------------------

  test("reset-password: token valido → password aggiornata, login con la nuova password", async () => {
    const user = await seedUser(`reset-${uniq()}@example.com`, "OldPass123");
    const raw = generateResetToken();
    await seedResetToken(user.id, raw, new Date(Date.now() + 60 * 60 * 1000));

    const res = await request("POST", "/api/auth/reset-password", { token: raw, newPassword: "BrandNew123" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.password, undefined);

    // login con la nuova password
    const login = await request("POST", "/api/auth/login", { email: user.email, password: "BrandNew123" });
    assert.equal(login.status, 200);
    // vecchia password non più valida
    const oldLogin = await request("POST", "/api/auth/login", { email: user.email, password: "OldPass123" });
    assert.equal(oldLogin.status, 401);
  });

  test("reset-password: token monouso → il secondo utilizzo fallisce (INVALID_TOKEN)", async () => {
    const user = await seedUser(`reset2-${uniq()}@example.com`, "OldPass123");
    const raw = generateResetToken();
    await seedResetToken(user.id, raw, new Date(Date.now() + 60 * 60 * 1000));

    const first = await request("POST", "/api/auth/reset-password", { token: raw, newPassword: "BrandNew123" });
    assert.equal(first.status, 200);

    const second = await request("POST", "/api/auth/reset-password", { token: raw, newPassword: "AnotherNew123" });
    assert.equal(second.status, 400);
    const body = await second.json();
    assert.equal(body.error.code, "INVALID_TOKEN");
  });

  test("reset-password: token scaduto → TOKEN_EXPIRED", async () => {
    const user = await seedUser(`reset3-${uniq()}@example.com`, "OldPass123");
    const raw = generateResetToken();
    await seedResetToken(user.id, raw, new Date(Date.now() - 1000)); // già scaduto

    const res = await request("POST", "/api/auth/reset-password", { token: raw, newPassword: "BrandNew123" });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "TOKEN_EXPIRED");
  });

  test("reset-password: token inesistente → INVALID_TOKEN", async () => {
    const res = await request("POST", "/api/auth/reset-password", { token: generateResetToken(), newPassword: "BrandNew123" });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "INVALID_TOKEN");
  });

  test("reset-password: password debole → VALIDATION_ERROR", async () => {
    const user = await seedUser(`reset4-${uniq()}@example.com`, "OldPass123");
    const raw = generateResetToken();
    await seedResetToken(user.id, raw, new Date(Date.now() + 60 * 60 * 1000));

    const res = await request("POST", "/api/auth/reset-password", { token: raw, newPassword: "debole" });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  // --- change-password (autenticato) -----------------------------------------

  test("change-password: password attuale corretta → aggiornata", async () => {
    const user = await seedUser(`change-${uniq()}@example.com`, "OldPass123");
    const token = generateAccessToken(user as any);

    const res = await request("POST", "/api/auth/change-password", { currentPassword: "OldPass123", newPassword: "BrandNew123" }, token);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.password, undefined);
    assert.equal(body.passwordHash, undefined);

    const login = await request("POST", "/api/auth/login", { email: user.email, password: "BrandNew123" });
    assert.equal(login.status, 200);
  });

  test("change-password: password attuale errata → 400", async () => {
    const user = await seedUser(`change2-${uniq()}@example.com`, "OldPass123");
    const token = generateAccessToken(user as any);

    const res = await request("POST", "/api/auth/change-password", { currentPassword: "Sbagliata123", newPassword: "BrandNew123" }, token);
    assert.equal(res.status, 400);
  });

  test("change-password: senza autenticazione → 401", async () => {
    const res = await request("POST", "/api/auth/change-password", { currentPassword: "OldPass123", newPassword: "BrandNew123" });
    assert.equal(res.status, 401);
  });

  // --- email: contiene il link, mai la password ------------------------------

  test("email di reset: contiene il link con il token, mai una password", async () => {
    process.env.CLIENT_URL = "https://app.example.com";
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      const raw = generateResetToken();
      await sendPasswordResetEmail("user@example.com", "Mario", raw);
      const joined = logs.join("\n");
      // Il link deve usare esattamente CLIENT_URL come base, col token nel path.
      assert.ok(joined.includes(`https://app.example.com/reset-password/${raw}`), "l'email deve contenere il link basato su CLIENT_URL col token");
      assert.ok(!joined.includes("undefined/reset-password"), "il link non deve mai essere rotto (undefined/...)");
      assert.ok(!/password\s*[:=]\s*\S/i.test(joined), "l'email non deve contenere una password in chiaro");
    } finally {
      console.log = original;
      delete process.env.CLIENT_URL;
    }
  });
});
