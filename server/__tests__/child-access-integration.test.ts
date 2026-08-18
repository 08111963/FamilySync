import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, childAccessCodes, bills, billAttachments, chatMessages, entitlements, chores, calendarEvents, rewards, shoppingLists } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE dell'accesso "dispositivo bambino" contro il DB reale e
 * l'app Express completa: generazione codice, attivazione monouso, aree vietate
 * (fail-closed) e revoca. Richiede DATABASE_URL.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("accesso dispositivo bambino (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[] };

  let adminId: string;
  let adminToken: string;
  let familyId: string;
  let memberId: string; // profilo bambino gestito (userId NULL)

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

  before(async () => {
    const app = express();
    app.use(express.json());
    await registerRoutes(app);
    server = app.listen(0);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    const [admin] = await db.insert(users).values({
      email: `parent-${uniq()}@test.local`,
      passwordHash: "x".repeat(20),
      name: "Parent",
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(admin.id);
    adminId = admin.id;
    adminToken = generateAccessToken(admin);

    const [fam] = await db.insert(families).values({ name: `Fam-${uniq()}` }).returning();
    created.families.push(fam.id);
    familyId = fam.id;
    await db.insert(familyMembers).values({ familyId, userId: adminId, role: "admin", nickname: "p", color: "#6366F1", points: 0 });
    const [child] = await db.insert(familyMembers).values({ familyId, userId: null, role: "child", nickname: "Luca", color: "#F59E0B", points: 5 }).returning();
    memberId = child.id;
  });

  after(async () => {
    server?.close();
    if (created.families.length) {
      await db.delete(childAccessCodes).where(inArray(childAccessCodes.familyId, created.families));
      await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      await db.delete(families).where(inArray(families.id, created.families));
    }
    // include lo shadow user creato dall'attivazione
    const shadow = await db.select({ id: users.id }).from(users).where(eq(users.email, `child-${memberId}@child.familysync.invalid`.toLowerCase()));
    const ids = [...created.users, ...shadow.map((s) => s.id)];
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  });

  let plainCode: string;
  let childToken: string;

  test("il genitore genera un codice (una sola volta in chiaro)", async () => {
    const res = await request("POST", `/api/families/${familyId}/members/${memberId}/child-access`, undefined, adminToken);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    plainCode = body.code;
    // nel DB c'è solo l'hash, mai il codice in chiaro
    const rows = await db.select().from(childAccessCodes).where(eq(childAccessCodes.memberId, memberId));
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].codeHash, plainCode.replace("-", ""));
  });

  test("l'attivazione crea lo shadow user e restituisce i token", async () => {
    const res = await request("POST", `/api/child-access/activate`, { code: plainCode });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.isChildAccount, true);
    assert.ok(body.accessToken && body.refreshToken);
    childToken = body.accessToken;
    // membro collegato, punti conservati
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, memberId));
    assert.ok(m.userId);
    assert.equal(m.points, 5);
  });

  test("il codice è monouso: il replay fallisce con errore generico", async () => {
    const res = await request("POST", `/api/child-access/activate`, { code: plainCode });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "CODE_INVALID");
  });

  test("aree consentite: famiglia, faccende, /me", async () => {
    for (const path of [`/api/families/${familyId}`, `/api/chores/${familyId}`, `/api/auth/me`]) {
      const res = await request("GET", path, undefined, childToken);
      assert.equal(res.status, 200, path);
    }
    const me = await (await request("GET", `/api/auth/me`, undefined, childToken)).json();
    assert.equal(me.isChildAccount, true);
  });

  test("aree vietate: 403 fail-closed per il bambino", async () => {
    const denied: Array<[string, string, unknown?]> = [
      ["GET", `/api/bills/${familyId}`],
      ["GET", `/api/expenses/${familyId}/summary`],
      ["POST", `/api/families`, { name: "x" }],
      ["POST", `/api/families/${familyId}/members/${memberId}/child-access`],
      ["DELETE", `/api/auth/account`, { password: "x" }],
      ["POST", `/api/auth/change-password`, { currentPassword: "a", newPassword: "b" }],
      ["POST", `/api/auth/onboarding`, {}],
      ["POST", `/api/auth/privacy-policy-ack`, {}],
      ["POST", `/api/auth/resend-verification-email`],
      ["DELETE", `/api/profile/avatar`],
      ["GET", `/api/moderation/preferences`],
      ["PATCH", `/api/moderation/preferences`, { aiFeaturesEnabled: true }],
      ["GET", `/api/moderation/consents`],
      ["GET", `/api/moderation/blocks/${familyId}`],
    ];
    for (const [method, path, body] of denied) {
      const res = await request(method, path, body, childToken);
      assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
    }
  });

  test("calendario: il bambino crea i propri eventi e modifica/elimina SOLO i propri (test A, B, C)", async () => {
    // Evento del genitore
    const [parentEvent] = await db.insert(calendarEvents).values({
      familyId, title: "Visita medica", date: "2030-05-01", color: "#6366F1", createdBy: adminId,
    }).returning();

    // La lettura resta consentita
    const read = await request("GET", `/api/calendar/${familyId}?startDate=2030-04-01&endDate=2030-06-30`, undefined, childToken);
    assert.equal(read.status, 200);

    // A: il bambino può creare un proprio evento
    const create = await request("POST", `/api/calendar/${familyId}`, { title: "Allenamento", date: "2030-05-02", color: "#F59E0B" }, childToken);
    assert.equal(create.status, 201);
    const ownEvent = await create.json();

    // B: può modificare ed eliminare SOLO il proprio evento
    const putOwn = await request("PUT", `/api/calendar/${familyId}/${ownEvent.id}`, { title: "Allenamento calcio" }, childToken);
    assert.equal(putOwn.status, 200);

    // C: modifica/eliminazione di eventi altrui = 403 CHILD_FORBIDDEN
    for (const [method, path, body] of [
      ["PUT", `/api/calendar/${familyId}/${parentEvent.id}`, { title: "Hack" }],
      ["DELETE", `/api/calendar/${familyId}/${parentEvent.id}`, undefined],
    ] as Array<[string, string, unknown?]>) {
      const res = await request(method, path, body, childToken);
      assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
      assert.equal((await res.json()).error.code, "CHILD_FORBIDDEN", `${method} ${path}`);
    }
    // l'evento del genitore è ancora lì
    const [still] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, parentEvent.id));
    assert.ok(still);
    assert.equal(still.title, "Visita medica");

    // B (delete): eliminazione del proprio evento consentita
    const delOwn = await request("DELETE", `/api/calendar/${familyId}/${ownEvent.id}`, undefined, childToken);
    assert.equal(delOwn.status, 200);

    // Serie ricorrente del genitore: anche con scope=series il bambino non
    // può eliminare nulla che non sia suo
    const [seriesEvent] = await db.insert(calendarEvents).values({
      familyId, title: "Piscina", date: "2030-05-03", color: "#10B981",
      recurrenceRule: "weekly:1", seriesId: crypto.randomUUID(), createdBy: adminId,
    }).returning();
    const delSeries = await request("DELETE", `/api/calendar/${familyId}/${seriesEvent.id}?scope=series`, undefined, childToken);
    assert.equal(delSeries.status, 403);
    assert.equal((await delSeries.json()).error.code, "CHILD_FORBIDDEN");
    const [seriesStill] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, seriesEvent.id));
    assert.ok(seriesStill);

    // Feed ICS: espone/rigenera il token di famiglia → sempre vietato al bambino
    for (const path of [`/api/calendar/${familyId}/feed-url?regenerate=1`, `/api/calendar/${familyId}/feed-url`]) {
      const res = await request("GET", path, undefined, childToken);
      assert.equal(res.status, 403, path);
      assert.equal((await res.json()).error.code, "CHILD_FORBIDDEN", path);
    }
  });

  test("spesa: il bambino aggiunge e spunta articoli, ma non gestisce liste/dettagli (test D, E, F)", async () => {
    const [list] = await db.insert(shoppingLists).values({
      familyId, name: "Spesa", createdBy: adminId,
    }).returning();

    // D: può aggiungere un articolo a una lista esistente
    const add = await request("POST", `/api/shopping/${familyId}/lists/${list.id}/items`, { name: "latte" }, childToken);
    assert.equal(add.status, 201);
    const item = await add.json();

    // E: può spuntare l'articolo (e togliere la spunta)
    const toggle = await request("PATCH", `/api/shopping/${familyId}/lists/${list.id}/items/${item.id}/toggle`, undefined, childToken);
    assert.equal(toggle.status, 200);
    assert.equal((await toggle.json()).isChecked, true);

    // F + operazioni strutturali: vietate al bambino
    const denied: Array<[string, string, unknown?]> = [
      ["POST", `/api/shopping/${familyId}/lists`, { name: "x" }],
      ["DELETE", `/api/shopping/${familyId}/lists/${list.id}`],
      ["PATCH", `/api/shopping/${familyId}/lists/${list.id}/items/${item.id}`, { name: "caramelle" }],
      ["DELETE", `/api/shopping/${familyId}/lists/${list.id}/items/${item.id}`],
    ];
    for (const [method, path, body] of denied) {
      const res = await request(method, path, body, childToken);
      assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
      assert.equal((await res.json()).error.code, "CHILD_FORBIDDEN", `${method} ${path}`);
    }
  });

  test("premi: il bambino riscatta con i propri punti ma non gestisce il catalogo (test G, H)", async () => {
    const [reward] = await db.insert(rewards).values({
      familyId, title: "Gelato", pointsCost: 1, createdBy: adminId,
    }).returning();

    // H: gestione catalogo vietata (403 dal controllo di ruolo admin/adulto)
    const denied: Array<[string, string, unknown?]> = [
      ["POST", `/api/rewards/${familyId}`, { title: "x", pointsCost: 1 }],
      ["PUT", `/api/rewards/${familyId}/${reward.id}`, { pointsCost: 0 }],
      ["DELETE", `/api/rewards/${familyId}/${reward.id}`],
    ];
    for (const [method, path, body] of denied) {
      const res = await request(method, path, body, childToken);
      assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
    }

    // G: riscatto consentito con punti sufficienti (5 iniziali, costo 1)
    const redeem = await request("POST", `/api/rewards/${familyId}/${reward.id}/redeem`, undefined, childToken);
    assert.equal(redeem.status, 201, JSON.stringify(await redeem.clone().json().catch(() => ({}))));
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, memberId));
    assert.equal(m.points, 4); // 5 - 1

    // Ripristina i punti iniziali per i test successivi
    await db.update(familyMembers).set({ points: 5 }).where(eq(familyMembers.id, memberId));
  });

  test("scritture vietate residue: famiglia e faccende", async () => {
    const denied: Array<[string, string, unknown?]> = [
      // Faccende: niente creazione/modifica/eliminazione (test I/J più sotto)
      ["POST", `/api/chores/${familyId}`, { title: "x", points: 99999, assignedTo: memberId }],
    ];
    for (const [method, path, body] of denied) {
      const res = await request(method, path, body, childToken);
      assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
      assert.equal((await res.json()).error.code, "CHILD_FORBIDDEN", `${method} ${path}`);
    }
  });

  test("faccende: il bambino completa SOLO quelle assegnate a sé", async () => {
    // Faccenda assegnata al genitore → il bambino non può completarla
    const [adminMember] = await db.select().from(familyMembers)
      .where(eq(familyMembers.userId, adminId));
    const [otherChore] = await db.insert(chores).values({
      familyId, title: "Faccenda genitore", points: 50, assignedTo: adminMember.id, createdBy: adminId,
    }).returning();
    const resOther = await request("PATCH", `/api/chores/${familyId}/${otherChore.id}/complete`, undefined, childToken);
    assert.equal(resOther.status, 403);
    assert.equal((await resOther.json()).error.code, "CHILD_FORBIDDEN");

    // Modifica/eliminazione vietate anche sulla propria faccenda
    const [ownChore] = await db.insert(chores).values({
      familyId, title: "Riordina la stanza", points: 10, assignedTo: memberId, createdBy: adminId,
    }).returning();
    const put = await request("PUT", `/api/chores/${familyId}/${ownChore.id}`, { points: 99999 }, childToken);
    assert.equal(put.status, 403);
    const del = await request("DELETE", `/api/chores/${familyId}/${ownChore.id}`, undefined, childToken);
    assert.equal(del.status, 403);

    // Completare la PROPRIA faccenda resta consentito (punti decisi dal genitore)
    const ok = await request("PATCH", `/api/chores/${familyId}/${ownChore.id}/complete`, undefined, childToken);
    assert.equal(ok.status, 200);
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, memberId));
    assert.equal(m.points, 15); // 5 iniziali + 10

    // Ripristina i punti iniziali: i test successivi (revoca/riattivazione)
    // verificano che i punti restino invariati a 5.
    await db.update(familyMembers).set({ points: 5 }).where(eq(familyMembers.id, memberId));
  });

  test("media token: il bambino NON può ottenere/usare token per allegati bollette", async () => {
    const billFile = `/uploads/bills/test-${uniq()}.pdf`;
    const chatFile = `/uploads/chat/test-${uniq()}.png`;

    // famiglia Premium (gli allegati bollette sono una funzione Premium)
    await db.insert(entitlements).values({ familyId, platform: "google", productId: "premium_test", status: "active", expiresAt: null });
    const [bill] = await db.insert(bills).values({ familyId, title: "Luce", amount: "10.00", dueDate: "2030-01-01" }).returning();
    await db.insert(billAttachments).values({ billId: bill.id, familyId, fileUrl: billFile, uploadedBy: adminId });
    await db.insert(chatMessages).values({ familyId, userId: adminId, messageType: "image", fileUrl: chatFile });

    // il genitore PUÒ ottenere un token per l'allegato bolletta
    const adultTok = await request("POST", `/api/auth/media-token`, { filePath: billFile }, adminToken);
    assert.equal(adultTok.status, 200);

    // il bambino NO (403), ma può per i file chat (area consentita)
    const childBill = await request("POST", `/api/auth/media-token`, { filePath: billFile }, childToken);
    assert.equal(childBill.status, 403);
    const childChat = await request("POST", `/api/auth/media-token`, { filePath: chatFile }, childToken);
    assert.equal(childChat.status, 200);

    // un token bambino family-scoped non serve comunque file bolletta (claim child verificato alla lettura)
    const scoped = await request("POST", `/api/auth/media-token`, { familyId }, childToken);
    assert.equal(scoped.status, 200);
    const { mediaToken } = await scoped.json();
    const fetchBill = await fetch(`${baseUrl}${billFile}?token=${encodeURIComponent(mediaToken)}`);
    assert.equal(fetchBill.status, 403);
    // lo stesso token bambino sui file chat supera l'autorizzazione (il file
    // fisico non esiste su disco: 404, ma NON 403)
    const fetchChat = await fetch(`${baseUrl}${chatFile}?token=${encodeURIComponent(mediaToken)}`);
    assert.notEqual(fetchChat.status, 403);
  });

  test("la revoca scollega il membro e invalida subito il token", async () => {
    const res = await request("DELETE", `/api/families/${familyId}/members/${memberId}/child-access`, undefined, adminToken);
    assert.equal(res.status, 200);
    const me = await request("GET", `/api/auth/me`, undefined, childToken);
    assert.equal(me.status, 401);
    // profilo di nuovo gestito, punti intatti
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, memberId));
    assert.equal(m.userId, null);
    assert.equal(m.points, 5);
  });

  test("RIATTIVAZIONE dopo revoca: nuovo codice → attiva di nuovo (shadow user ripristinato)", async () => {
    // il genitore genera un nuovo codice per lo stesso profilo
    const gen = await request("POST", `/api/families/${familyId}/members/${memberId}/child-access`, undefined, adminToken);
    assert.equal(gen.status, 201);
    const { code } = await gen.json();

    // l'attivazione deve RIUSARE lo shadow user soft-eliminato (email sintetica
    // deterministica già presente in users), non fallire per email duplicata
    const act = await request("POST", `/api/child-access/activate`, { code });
    assert.equal(act.status, 200);
    const body = await act.json();
    assert.equal(body.user.isChildAccount, true);

    // il nuovo token funziona, il vecchio (pre-revoca) resta invalido
    const meNew = await request("GET", `/api/auth/me`, undefined, body.accessToken);
    assert.equal(meNew.status, 200);
    const meOld = await request("GET", `/api/auth/me`, undefined, childToken);
    assert.equal(meOld.status, 401);

    // membro ricollegato allo stesso shadow user, punti intatti
    const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, memberId));
    assert.ok(m.userId);
    assert.equal(m.points, 5);
  });
});
