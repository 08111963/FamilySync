import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { families, familyMembers, users } from "../../shared/schema";
import { registerRoutes } from "../routes";
import { generateAccessToken } from "../lib/jwt";
import { deleteStoredUploads } from "../lib/upload-storage";

const hasDb = !!process.env.DATABASE_URL;

describe("foto condivisa della famiglia (DB + HTTP)", { skip: hasDb ? false : "DATABASE_URL non impostata" }, () => {
  let server: Server;
  let baseUrl: string;
  let familyId: string;
  let memberToken: string;
  let childToken: string;
  const createdUserIds: string[] = [];
  const createdFileUrls: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function seedUser(email: string, isChildAccount = false) {
    const [user] = await db.insert(users).values({
      email,
      passwordHash: "x".repeat(20),
      name: "Photo Tester",
      emailVerified: true,
      termsAcceptedAt: new Date(),
      isChildAccount,
    }).returning();
    createdUserIds.push(user.id);
    return user;
  }

  async function addMember(userId: string, role: "admin" | "adult" | "teen" | "child") {
    await db.insert(familyMembers).values({
      familyId,
      userId,
      role,
      nickname: "Tester",
      color: "#0D9488",
    });
  }

  async function upload(token: string, bytes: Uint8Array, type = "image/png") {
    const form = new FormData();
    const payload = new Uint8Array(bytes);
    form.append("file", new Blob([payload.buffer as ArrayBuffer], { type }), "family.png");
    return fetch(`${baseUrl}/api/families/${familyId}/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }

  before(async () => {
    if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "test-secret";
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    const [family] = await db.insert(families).values({
      name: `Family photo ${suffix}`,
    }).returning();
    familyId = family.id;

    const member = await seedUser(`family-photo-member-${suffix}@example.test`);
    memberToken = generateAccessToken(member);
    await addMember(member.id, "adult");

    const child = await seedUser(`family-photo-child-${suffix}@example.test`, true);
    childToken = generateAccessToken(child);
    await addMember(child.id, "child");
  });

  after(async () => {
    await deleteStoredUploads(createdFileUrls);
    await db.delete(families).where(eq(families.id, familyId));
    if (createdUserIds.length) {
      for (const userId of createdUserIds) {
        await db.delete(users).where(eq(users.id, userId));
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("un membro con account completo può caricare e rimuovere la foto condivisa", async () => {
    // PNG valido e decodificabile 1×1: controlla firma e decodifica completa.
    const png = Uint8Array.from(await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 13, g: 148, b: 136, alpha: 1 },
      },
    }).png().toBuffer());
    const uploaded = await upload(memberToken, png);
    assert.equal(uploaded.status, 200);
    const body = await uploaded.json() as { avatarUrl: string };
    assert.match(body.avatarUrl, /^\/uploads\/family-avatars\/[a-f0-9]+\.png$/);
    createdFileUrls.push(body.avatarUrl);

    const anonymousFile = await fetch(`${baseUrl}${body.avatarUrl}`);
    assert.equal(anonymousFile.status, 401);

    const tokenResponse = await fetch(`${baseUrl}/api/auth/media-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ familyId }),
    });
    assert.equal(tokenResponse.status, 200);
    const { mediaToken } = await tokenResponse.json() as { mediaToken: string };
    const authorizedFile = await fetch(`${baseUrl}${body.avatarUrl}?token=${encodeURIComponent(mediaToken)}`);
    assert.equal(authorizedFile.status, 200);

    const childTokenResponse = await fetch(`${baseUrl}/api/auth/media-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${childToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ familyId }),
    });
    assert.equal(childTokenResponse.status, 200);
    const { mediaToken: childMediaToken } = await childTokenResponse.json() as { mediaToken: string };
    const childCanReadFile = await fetch(
      `${baseUrl}${body.avatarUrl}?token=${encodeURIComponent(childMediaToken)}`,
    );
    assert.equal(childCanReadFile.status, 200);

    const detail = await fetch(`${baseUrl}/api/families/${familyId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).avatarUrl, body.avatarUrl);

    const removed = await fetch(`${baseUrl}/api/families/${familyId}/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(removed.status, 200);
    const [familyAfterRemoval] = await db.select().from(families).where(eq(families.id, familyId));
    assert.equal(familyAfterRemoval.avatarUrl, null);
  });

  test("un account bambino non può modificare la foto condivisa", async () => {
    const response = await upload(childToken, Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "CHILD_FORBIDDEN");
  });

  test("un file dichiarato come immagine ma con contenuto non valido viene rifiutato", async () => {
    const response = await upload(memberToken, new TextEncoder().encode("non è una foto"));
    assert.equal(response.status, 415);
    assert.equal((await response.json()).error.code, "INVALID_IMAGE");
  });

  test("un'immagine con firma valida ma tronca viene rifiutata", async () => {
    const truncatedPng = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const response = await upload(memberToken, truncatedPng);
    assert.equal(response.status, 415);
    assert.equal((await response.json()).error.code, "INVALID_IMAGE");
  });
});