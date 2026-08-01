/**
 * Test integrazione: una foto ricetta resta visibile dopo un redeploy.
 *
 * Su autoscale un redeploy azzera il disco locale (e la cache in-memory del
 * processo). Le foto ricette AI vengono persistite su Replit Object Storage
 * (chiave uploads/recipe-images/<hash>.webp): questo test simula la perdita
 * del disco e verifica che:
 *  1. la foto continui a essere servita da GET /uploads/recipe-images/<file>.webp
 *     direttamente dal bucket (il file locale NON esiste piu');
 *  2. il cache-hit per titolo NON consumi quota AI:
 *     - POST /api/ai/:familyId/recipe-image risponde { cached: true } senza
 *       chiamare OpenAI ne' scrivere righe in ai_usage;
 *     - POST /api/ai/:familyId/recipe-images/resolve risolve l'URL in batch.
 *
 * Richiede l'ambiente Replit (bucket Object Storage) e il DB di sviluppo.
 * Esecuzione: npx tsx server/__tests__/recipe-image-redeploy.test.ts
 */

// STORAGE_MODE (e gli altri env letti al load) vanno impostati PRIMA di ogni
// import del server: con gli import ESM hoisted serve un modulo side-effect.
import "./helpers/test-env-object-storage";

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { users, families, familyMembers, aiUsage } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";
import { recipeImageCacheKey } from "../lib/recipe-image-prewarm";
import {
  persistUploadedFile,
  uploadObjectExists,
  deleteStoredUploads,
  isObjectStorageMode,
} from "../lib/upload-storage";

const IMAGES_DIR = path.resolve("uploads", "recipe-images");

describe("foto ricetta dopo redeploy (Object Storage)", () => {
  let server: Server;
  let baseUrl: string;
  let token: string;
  let userId: string;
  let familyId: string;

  // Titolo unico per run: nessuna collisione con cache reali o run precedenti.
  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const title = `Test redeploy ${uniq}`;
  const fileName = `${recipeImageCacheKey(title)}.webp`;
  const publicUrl = `/uploads/recipe-images/${fileName}`;
  const localPath = path.join(IMAGES_DIR, fileName);

  let imageBytes: Buffer;

  function request(method: string, apiPath: string, body?: unknown) {
    return fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function recipeImageQuotaRows(): Promise<number> {
    const rows = await db
      .select({ id: aiUsage.id })
      .from(aiUsage)
      .where(and(eq(aiUsage.familyId, familyId), eq(aiUsage.feature, "recipe-image")));
    return rows.length;
  }

  before(async () => {
    assert.equal(isObjectStorageMode(), true, "il test richiede STORAGE_MODE=object-storage");

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    // Utente con consenso AI attivo + fascia d'eta' adulta (requireAiEnabled).
    const [u] = await db.insert(users).values({
      email: `redeploy-${uniq}@example.com`,
      passwordHash: "x".repeat(20),
      name: "Redeploy Tester",
      emailVerified: true,
      termsAcceptedAt: new Date(),
      aiFeaturesEnabled: true,
      ageBand: "adult",
    }).returning();
    userId = u.id;
    token = generateAccessToken(u);

    const [fam] = await db.insert(families).values({
      name: `Famiglia Redeploy ${uniq}`,
      colorTheme: "#6366F1",
    }).returning();
    familyId = fam.id;
    await db.insert(familyMembers).values({
      familyId, userId, role: "admin", nickname: "t", color: "#6366F1", points: 0,
    });

    // Simula la generazione: file WebP scritto su disco e persistito nel
    // bucket (persistUploadedFile rimuove il file locale, come in produzione).
    imageBytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 80, b: 40 } },
    }).webp({ quality: 80 }).toBuffer();
    await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
    await fs.promises.writeFile(localPath, imageBytes);
    await persistUploadedFile(localPath, publicUrl);
  });

  after(async () => {
    await deleteStoredUploads([publicUrl]);
    await fs.promises.unlink(localPath).catch(() => {});
    if (familyId) {
      await db.delete(aiUsage).where(eq(aiUsage.familyId, familyId));
      await db.delete(familyMembers).where(eq(familyMembers.familyId, familyId));
      await db.delete(families).where(eq(families.id, familyId));
    }
    if (userId) await db.delete(users).where(eq(users.id, userId));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("redeploy simulato: il file locale NON esiste, l'oggetto nel bucket si'", async () => {
    // persistUploadedFile ha gia' rimosso il file locale: e' esattamente lo
    // stato post-redeploy (disco vuoto, bucket popolato, cache in-memory persa
    // perche' il processo del test e' "nuovo").
    assert.equal(fs.existsSync(localPath), false, "il file locale deve essere sparito");
    assert.equal(await uploadObjectExists(publicUrl), true, "l'oggetto deve esistere nel bucket");
  });

  test("GET /uploads/recipe-images/<file>.webp serve la foto dal bucket", async () => {
    const res = await fetch(`${baseUrl}${publicUrl}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    // Cache pubblica immutabile (come montata in routes.ts).
    assert.match(res.headers.get("cache-control") ?? "", /public/);
    const body = Buffer.from(await res.arrayBuffer());
    assert.ok(body.equals(imageBytes), "i byte serviti devono coincidere con l'originale");
  });

  test("POST /api/ai/:familyId/recipe-image e' cache-hit (cached:true) senza quota", async () => {
    const beforeRows = await recipeImageQuotaRows();

    const res = await request("POST", `/api/ai/${familyId}/recipe-image`, { title });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.cached, true, "deve essere un cache-hit dal bucket");
    assert.equal(data.url, publicUrl);

    // Seconda chiamata: copre anche il percorso Set in-memory (gia' popolato).
    const res2 = await request("POST", `/api/ai/${familyId}/recipe-image`, { title });
    assert.equal(res2.status, 200);
    assert.equal((await res2.json()).cached, true);

    const afterRows = await recipeImageQuotaRows();
    assert.equal(afterRows, beforeRows, "il cache-hit non deve scrivere righe di quota ai_usage");
  });

  test("POST /api/ai/:familyId/recipe-images/resolve risolve l'URL in batch senza quota", async () => {
    const beforeRows = await recipeImageQuotaRows();

    const missingTitle = `Mai generata ${uniq}`;
    const res = await request("POST", `/api/ai/${familyId}/recipe-images/resolve`, {
      titles: [title, missingTitle],
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.urls[title], publicUrl, "titolo in cache -> URL pubblico");
    assert.equal(data.urls[missingTitle], null, "titolo mai generato -> null (nessuna generazione)");

    const afterRows = await recipeImageQuotaRows();
    assert.equal(afterRows, beforeRows, "il resolve non deve mai consumare quota");
  });

  test("il file locale resta assente: il servizio arriva davvero dal bucket", async () => {
    assert.equal(fs.existsSync(localPath), false);
  });
});
