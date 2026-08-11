/**
 * Test UI (Playwright, viewport mobile) per il messaggio "ultimo admin"
 * nella schermata Famiglia.
 *
 * Verifica che quando il backend risponde 409 LAST_ADMIN il frontend mostri
 * davvero l'alert con il messaggio del backend ("...Promuovi prima un altro
 * membro ad admin."):
 *  1. Rimozione dell'unico admin (trash → confirm → DELETE 409 → alert):
 *     è l'unico flusso UI che può davvero incontrare LAST_ADMIN.
 *  2. Pannello modifica profilo (salva → PUT 409 → alert, pannello aperto):
 *     verifica il plumbing d'errore (getApiErrorMessage → alert) del
 *     salvataggio. NOTA: il declassamento di un admin con account NON è
 *     raggiungibile dalla UI (il pannello ruoli esiste solo per i profili
 *     gestiti, limitati a child/teen), quindi il 409 LAST_ADMIN su cambio
 *     ruolo non può verificarsi end-to-end dall'app; la guardia backend è
 *     coperta da server/__tests__/last-admin-protection.test.ts. Qui lo
 *     stub usa il body 409 reale per verificare che, SE il backend rifiuta
 *     il salvataggio, il suo messaggio arrivi intatto all'utente.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * Tutte le /api/** sono stubbate: nessun DB reale. I body 409 replicano
 * esattamente quelli di server/routes/families.ts (LAST_ADMIN).
 *
 * Esecuzione: npx tsx e2e/last-admin-alert.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const SELF_MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const ADMIN_MEMBER_ID = "66666666-6666-4666-8666-666666666666";
const MANAGED_MEMBER_ID = "55555555-5555-4555-8555-555555555555";
const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "e2e-last-admin@test.local",
  name: "Adulto E2E",
  emailVerified: true,
};

// Messaggi reali del backend (server/routes/families.ts, 409 LAST_ADMIN).
const DELETE_MSG =
  "Non puoi rimuovere l'unico amministratore della famiglia. Promuovi prima un altro membro ad admin.";
const ROLE_MSG =
  "Non puoi cambiare ruolo all'unico amministratore della famiglia. Promuovi prima un altro membro ad admin.";

let deleteAttempts = 0;
let putAttempts = 0;

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function stubApi(pg: Page) {
  // Workaround export locale senza EXPO_PUBLIC_DOMAIN (vedi altri test e2e).
  await pg.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  await pg.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/auth/me") return json(USER);
    if (path === "/api/families" && method === "GET")
      return json([
        {
          id: FAMILY_ID,
          name: "Famiglia E2E",
          myRole: "adult",
          myMemberId: SELF_MEMBER_ID,
          subscriptionStatus: "free",
        },
      ]);
    if (path === `/api/families/${FAMILY_ID}` && method === "GET")
      return json({
        id: FAMILY_ID,
        name: "Famiglia E2E",
        members: [
          {
            id: SELF_MEMBER_ID,
            userId: USER.id,
            name: "Adulto E2E",
            role: "adult",
            color: "#3B82F6",
            points: 0,
            avatarUrl: null,
          },
          {
            id: ADMIN_MEMBER_ID,
            userId: "33333333-3333-4333-8333-333333333333",
            name: "Unico Admin",
            role: "admin",
            color: "#EF4444",
            points: 0,
            avatarUrl: null,
          },
          {
            id: MANAGED_MEMBER_ID,
            userId: null,
            name: "Piccolo E2e",
            role: "child",
            color: "#6366F1",
            points: 0,
            avatarUrl: null,
          },
        ],
      });
    // Rimozione dell'unico admin: 409 LAST_ADMIN come il backend vero.
    if (path === `/api/families/${FAMILY_ID}/members/${ADMIN_MEMBER_ID}` && method === "DELETE") {
      deleteAttempts++;
      return json({ error: { code: "LAST_ADMIN", message: DELETE_MSG } }, 409);
    }
    // Cambio ruolo: 409 LAST_ADMIN come il backend vero.
    if (path === `/api/families/${FAMILY_ID}/members/${MANAGED_MEMBER_ID}` && method === "PUT") {
      putAttempts++;
      return json({ error: { code: "LAST_ADMIN", message: ROLE_MSG } }, 409);
    }
    if (path === "/api/moderation/preferences") return json({ aiFeaturesEnabled: false });
    return json(method === "GET" ? [] : {});
  });
}

/** Dialog visti (confirm accettati, alert catturati). */
const dialogs: { type: string; message: string }[] = [];

describe("Alert 'ultimo admin' nella schermata Famiglia", () => {
  before(async () => {
    const res = await fetch(BASE_URL).catch(() => null);
    if (!res || !res.ok) {
      throw new Error(
        `Backend non raggiungibile su ${BASE_URL}: avviare il workflow "Start Backend"`
      );
    }

    browser = await chromium.launch({
      executablePath: process.env.E2E_CHROMIUM_PATH ||
        "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
    });
    page = await context.newPage();
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      await dialog.accept();
    });
    await stubApi(page);
    await page.addInitScript(
      ({ authKey, familyKey, familyId, user }) => {
        localStorage.setItem(
          authKey,
          JSON.stringify({
            user,
            accessToken: "e2e-fake-access-token",
            refreshToken: "e2e-fake-refresh-token",
          })
        );
        localStorage.setItem(familyKey, familyId);
      },
      { authKey: AUTH_KEY, familyKey: ACTIVE_FAMILY_KEY, familyId: FAMILY_ID, user: USER }
    );

    await page.goto(`${BASE_URL}/family`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByText("Unico Admin").first().waitFor({ timeout: 60000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("rimozione dell'unico admin: alert col messaggio del backend", async () => {
    dialogs.length = 0;
    await page.getByTestId(`delete-member-${ADMIN_MEMBER_ID}`).tap();

    // Prima il confirm ("Rimuovere ... ?"), poi — dopo il 409 — l'alert.
    await page.waitForFunction(
      () => true, // solo per cedere il loop; i dialog arrivano via evento
      undefined,
      { timeout: 1000 }
    ).catch(() => {});
    // Attendi che la DELETE sia partita e l'alert sia stato mostrato.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && dialogs.filter((d) => d.type === "alert").length === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }

    assert.equal(deleteAttempts, 1, "deve partire esattamente una DELETE");
    const confirmDialog = dialogs.find((d) => d.type === "confirm");
    assert.ok(confirmDialog, "deve apparire il confirm di rimozione");
    assert.match(confirmDialog!.message, /Rimuovere Unico Admin dalla famiglia\?/);
    const alertDialog = dialogs.find((d) => d.type === "alert");
    assert.ok(alertDialog, "deve apparire l'alert dopo il 409 LAST_ADMIN");
    assert.equal(
      alertDialog!.message,
      DELETE_MSG,
      "l'alert deve mostrare il messaggio del backend (rimozione ultimo admin)"
    );
    assert.match(alertDialog!.message, /Promuovi prima un altro membro ad admin/);

    // L'admin è ancora in lista (la rimozione è fallita).
    assert.ok(
      await page.getByText("Unico Admin").first().isVisible(),
      "l'unico admin deve restare nella lista membri"
    );
  });

  test("salvataggio respinto dal backend (409): alert col messaggio del backend e pannello ancora aperto", async () => {
    dialogs.length = 0;

    await page.getByTestId(`rename-member-${MANAGED_MEMBER_ID}`).tap();
    const input = page.getByTestId(`member-name-input-${MANAGED_MEMBER_ID}`);
    await input.waitFor({ timeout: 10000 });

    await page.getByTestId(`save-member-name-${MANAGED_MEMBER_ID}`).tap();

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && dialogs.filter((d) => d.type === "alert").length === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }

    assert.equal(putAttempts, 1, "deve partire esattamente una PUT");
    const alertDialog = dialogs.find((d) => d.type === "alert");
    assert.ok(alertDialog, "deve apparire l'alert dopo il 409 LAST_ADMIN");
    assert.equal(
      alertDialog!.message,
      ROLE_MSG,
      "l'alert deve mostrare il messaggio del backend (cambio ruolo ultimo admin)"
    );
    assert.match(alertDialog!.message, /Promuovi prima un altro membro ad admin/);

    // Il pannello di modifica resta aperto: il salvataggio è fallito.
    assert.ok(
      await input.isVisible(),
      "il pannello di modifica deve restare aperto dopo l'errore"
    );
  });
});
