import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, mealPlans, mealPlanItems } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";

/**
 * Test di INTEGRAZIONE della sostituzione del piano pasti (task: verifica che
 * "Salva piano" con piano esistente funzioni davvero) contro DB reale e app
 * Express completa:
 *  1) salvataggio normale ok (201);
 *  2) con piano esistente e replace assente → 409 PLAN_EXISTS (il client
 *     mostra la domanda "Vuoi sostituirlo?");
 *  3) replace=true → sostituzione atomica: nuovo id, UNA sola riga per la
 *     settimana, items presenti;
 *  4) se il replace fallisce (items non validi) il vecchio piano resta intatto
 *     — la delete+insert avviene in un'unica transazione;
 *  5) "Annulla" = nessuna chiamata: il piano esistente resta invariato (coperto
 *     dal punto 2: il 409 non modifica nulla).
 * Richiede DATABASE_URL. Il percorso UI (dialogo window.confirm/Alert) è stato
 * verificato con il test Playwright end-to-end.
 */
const hasDb = !!process.env.DATABASE_URL;

describe("sostituzione piano pasti (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;

  const created = { users: [] as string[], families: [] as string[] };

  let userId: string;
  let token: string;
  let familyId: string;

  const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const WEEK = "2030-03-04"; // lunedì futuro fisso, solo per questa famiglia di test

  const validItems = [
    { date: "2030-03-04", mealType: "lunch", titleOverride: "Pasta al pomodoro" },
    { date: "2030-03-05", mealType: "dinner", titleOverride: "Minestrone" },
  ];

  function request(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const savePlan = (body: Record<string, unknown>) =>
    request("POST", `/api/meal-plans/${familyId}/meal-plans`, {
      title: "Piano Settimanale",
      weekStartDate: WEEK,
      items: validItems,
      ...body,
    });

  const plansForWeek = () =>
    db.select().from(mealPlans).where(eq(mealPlans.familyId, familyId));

  before(async () => {
    const app = express();
    app.use(express.json());
    await registerRoutes(app);
    server = app.listen(0);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    const [u] = await db.insert(users).values({
      email: `mealplan-${uniq()}@test.local`,
      passwordHash: "x".repeat(20),
      name: "Meal Tester",
      emailVerified: true,
      termsAcceptedAt: new Date(),
    }).returning();
    created.users.push(u.id);
    userId = u.id;
    token = generateAccessToken(u);

    const [fam] = await db.insert(families).values({ name: `FamMeal-${uniq()}` }).returning();
    created.families.push(fam.id);
    familyId = fam.id;
    await db.insert(familyMembers).values({ familyId, userId, role: "admin", nickname: "m", color: "#6366F1", points: 0 });
  });

  after(async () => {
    server?.close();
    if (created.families.length) {
      const plans = await db.select({ id: mealPlans.id }).from(mealPlans).where(inArray(mealPlans.familyId, created.families));
      const planIds = plans.map((p) => p.id);
      if (planIds.length) await db.delete(mealPlanItems).where(inArray(mealPlanItems.mealPlanId, planIds));
      await db.delete(mealPlans).where(inArray(mealPlans.familyId, created.families));
      await db.delete(familyMembers).where(inArray(familyMembers.familyId, created.families));
      await db.delete(families).where(inArray(families.id, created.families));
    }
    if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  });

  let firstPlanId: string;

  test("1) salvataggio normale: 201 e piano con items", async () => {
    const res = await savePlan({});
    assert.equal(res.status, 201);
    const body = await res.json();
    firstPlanId = body.id;
    assert.ok(firstPlanId);
    assert.equal(body.items.length, validItems.length);
    const rows = await plansForWeek();
    assert.equal(rows.length, 1);
  });

  test("2) piano esistente senza replace: 409 PLAN_EXISTS e nulla cambia (= Annulla)", async () => {
    const res = await savePlan({});
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "PLAN_EXISTS");
    // "Annulla" nel client = nessuna seconda chiamata: il DB deve essere invariato.
    const rows = await plansForWeek();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, firstPlanId);
  });

  test("3a) replace fallito (items non validi): il vecchio piano resta intatto", async () => {
    const res = await savePlan({ replace: true, items: [{ date: "non-una-data", mealType: "lunch" }] });
    assert.equal(res.status, 400); // VALIDATION_ERROR prima della transazione
    const rows = await plansForWeek();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, firstPlanId);
  });

  test("3b) errore DB DOPO la delete (FK violata sugli items): rollback, il vecchio piano resta intatto", async () => {
    // recipeId sintatticamente valido ma inesistente: passa Zod, ma l'insert
    // degli items (dopo la delete del vecchio piano, nella stessa transazione)
    // viola la foreign key → la transazione fa rollback.
    const res = await savePlan({
      replace: true,
      items: [{ date: "2030-03-04", mealType: "lunch", recipeId: "00000000-0000-4000-8000-000000000000", titleOverride: "X" }],
    });
    assert.equal(res.status, 500);
    const rows = await plansForWeek();
    assert.equal(rows.length, 1, "il vecchio piano NON deve essere andato perso");
    assert.equal(rows[0].id, firstPlanId);
    const items = await db.select().from(mealPlanItems).where(eq(mealPlanItems.mealPlanId, firstPlanId));
    assert.equal(items.length, validItems.length, "gli items del vecchio piano devono essere intatti");
  });

  test("4) replace=true: sostituzione atomica con nuovo id e items", async () => {
    const res = await savePlan({ replace: true, title: "Piano Sostituito" });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.notEqual(body.id, firstPlanId);
    const rows = await plansForWeek();
    assert.equal(rows.length, 1, "deve esserci UNA sola riga per la settimana");
    assert.equal(rows[0].id, body.id);
    assert.equal(rows[0].title, "Piano Sostituito");
    const items = await db.select().from(mealPlanItems).where(eq(mealPlanItems.mealPlanId, body.id));
    assert.equal(items.length, validItems.length);
    // Gli items del vecchio piano non devono più esistere.
    const oldItems = await db.select().from(mealPlanItems).where(eq(mealPlanItems.mealPlanId, firstPlanId));
    assert.equal(oldItems.length, 0);
  });
});
