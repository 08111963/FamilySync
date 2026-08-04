/**
 * Test UI (Playwright, viewport mobile) per la modifica dei profili gestiti
 * nella schermata Famiglia (matita → nome + palette colori + ruolo).
 *
 * Verifica che:
 *  1. Il genitore apre il pannello di modifica di un profilo gestito, cambia
 *     colore e ruolo (Figlio/a → Adolescente), salva: la PUT parte con il
 *     body giusto, il badge diventa "Adolescente" e l'avatar assume il nuovo
 *     colore (verificato sul backgroundColor calcolato).
 *  2. Con nome < 2 caratteri il salvataggio NON parte (nessuna PUT), il
 *     pannello resta aperto e i dati visualizzati non cambiano.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * Tutte le /api/** sono stubbate con stato in-memory: nessun DB reale.
 *
 * Esecuzione: npx tsx e2e/member-edit.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const CHILD_MEMBER_ID = "55555555-5555-4555-8555-555555555555";
const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "e2e-member-edit@test.local",
  name: "Tester E2E",
  emailVerified: true,
};

const NEW_COLOR = "#10B981"; // verde della palette AVATAR_COLORS
const NEW_COLOR_RGB = "rgb(16, 185, 129)";
const OLD_COLOR = "#6366F1";
const OLD_COLOR_RGB = "rgb(99, 102, 241)";

// Stato in-memory del profilo gestito: la PUT stubbata lo aggiorna e la GET
// successiva lo riflette, come farebbe il backend vero.
const childMember = {
  id: CHILD_MEMBER_ID,
  userId: null as string | null,
  name: "Piccolo E2e",
  role: "child",
  color: OLD_COLOR,
  points: 0,
  avatarUrl: null,
};

/** Body ricevuti dalle PUT sul membro gestito. */
const putBodies: any[] = [];

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function stubApi(pg: Page) {
  // La web-build locale può essere stata esportata SENZA EXPO_PUBLIC_DOMAIN:
  // riscriviamo il throw inlinato di getApiUrl() (stesso workaround degli
  // altri test e2e), così l'app punta a BASE_URL; le /api restano stubbate.
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
          myRole: "admin",
          myMemberId: PARENT_MEMBER_ID,
          subscriptionStatus: "free",
        },
      ]);
    if (path === `/api/families/${FAMILY_ID}` && method === "GET")
      return json({
        id: FAMILY_ID,
        name: "Famiglia E2E",
        members: [
          {
            id: PARENT_MEMBER_ID,
            userId: USER.id,
            name: "Tester E2E",
            role: "admin",
            color: "#3B82F6",
            points: 0,
            avatarUrl: null,
          },
          { ...childMember },
        ],
      });
    if (path === `/api/families/${FAMILY_ID}/members/${CHILD_MEMBER_ID}` && method === "PUT") {
      const body = route.request().postDataJSON();
      putBodies.push(body);
      const name = String(body?.name ?? "").trim();
      if (name.length < 2) return json({ error: "INVALID_NAME" }, 400);
      childMember.name = name;
      if (body.color) childMember.color = body.color;
      if (body.role) childMember.role = body.role;
      return json({ ...childMember });
    }
    if (path === "/api/moderation/preferences") return json({ aiFeaturesEnabled: false });
    // Qualsiasi altra GET risponde con lista vuota, le altre con oggetto vuoto.
    return json(method === "GET" ? [] : {});
  });
}

/** backgroundColor calcolato dell'avatar del profilo gestito (iniziali "PE"). */
async function childAvatarBg(pg: Page): Promise<string | null> {
  return pg.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("div"));
    const label = nodes.find(
      (el) => el.textContent === "PE" && el.childElementCount === 0
    );
    const wrapper = label?.parentElement;
    return wrapper ? getComputedStyle(wrapper).backgroundColor : null;
  });
}

describe("Modifica colore e ruolo profilo gestito (schermata Famiglia)", () => {
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
    await page.getByText("Piccolo E2e").first().waitFor({ timeout: 60000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("stato iniziale: badge Figlio/a e avatar col colore originale", async () => {
    await page.getByText("Figlio/a").first().waitFor({ timeout: 15000 });
    assert.equal(
      await childAvatarBg(page),
      OLD_COLOR_RGB,
      "l'avatar del profilo gestito deve partire dal colore originale"
    );
  });

  test("cambia colore e ruolo, salva: PUT corretta, badge Adolescente, avatar verde", async () => {
    await page.getByTestId(`rename-member-${CHILD_MEMBER_ID}`).tap();
    await page.getByTestId(`member-name-input-${CHILD_MEMBER_ID}`).waitFor({ timeout: 10000 });

    // Palette: seleziona il verde; ruolo: Adolescente.
    await page.getByTestId(`member-color-${CHILD_MEMBER_ID}-${NEW_COLOR.slice(1)}`).tap();
    await page.getByTestId(`member-role-${CHILD_MEMBER_ID}-teen`).tap();
    await page.getByTestId(`save-member-name-${CHILD_MEMBER_ID}`).tap();

    // Il pannello di modifica si chiude dopo il salvataggio riuscito.
    await page
      .getByTestId(`member-name-input-${CHILD_MEMBER_ID}`)
      .waitFor({ state: "detached", timeout: 15000 });

    assert.equal(putBodies.length, 1, "deve partire esattamente una PUT");
    assert.deepEqual(
      putBodies[0],
      { name: "Piccolo E2e", color: NEW_COLOR, role: "teen" },
      "la PUT deve contenere nome, colore e ruolo scelti"
    );

    // Dopo l'invalidazione della query il badge e l'avatar riflettono i nuovi dati.
    await page.getByText("Adolescente").first().waitFor({ timeout: 15000 });
    await page.waitForFunction(
      (expected) => {
        const nodes = Array.from(document.querySelectorAll("div"));
        const label = nodes.find(
          (el) => el.textContent === "PE" && el.childElementCount === 0
        );
        const wrapper = label?.parentElement;
        return wrapper && getComputedStyle(wrapper).backgroundColor === expected;
      },
      NEW_COLOR_RGB,
      { timeout: 15000 }
    );
  });

  test("nome < 2 caratteri: nessuna PUT, il pannello resta aperto", async () => {
    const putCountBefore = putBodies.length;

    await page.getByTestId(`rename-member-${CHILD_MEMBER_ID}`).tap();
    const input = page.getByTestId(`member-name-input-${CHILD_MEMBER_ID}`);
    await input.waitFor({ timeout: 10000 });

    await input.fill("X");
    await page.getByTestId(`save-member-name-${CHILD_MEMBER_ID}`).tap();
    await page.waitForTimeout(1000);

    assert.equal(
      putBodies.length,
      putCountBefore,
      "con nome troppo corto NON deve partire nessuna PUT"
    );
    assert.ok(
      await input.isVisible(),
      "il pannello di modifica deve restare aperto (salvataggio rifiutato)"
    );
  });
});
