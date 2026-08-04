/**
 * Test UI (Playwright, viewport mobile) per la pagina Ricette con tastiera aperta.
 *
 * Verifica che:
 *  1. Un singolo tap sull'input della ricerca AI dia subito il focus (niente
 *     doppio tap richiesto: keyboardShouldPersistTaps="handled").
 *  2. Un singolo tap sull'input "Cerca tra le ricette salvate" dia il focus
 *     anche quando la "tastiera" è già aperta (altro input focalizzato).
 *  3. L'header dei controlli (pulsante Genera, barre di ricerca) SCORRA
 *     insieme alle card della lista — il test fallisce se torna fisso —
 *     mentre la barra di navigazione "Le Mie Ricette" resta fissa.
 *  4. Il tap sul pulsante "Genera" funzioni al PRIMO colpo con l'input ancora
 *     focalizzato (tastiera aperta): la navigazione verso la preview parte.
 *  5. Lo swipe verso il basso in cima alla lista (gesto pull-to-refresh) non
 *     rompa la pagina né entri in conflitto con lo scroll.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * Tutte le chiamate /api/** sono stubbate: nessun DB e nessuna AI reale.
 *
 * Esecuzione: npx tsx e2e/recipes-keyboard.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "e2e-recipes@test.local",
  name: "Tester E2E",
  emailVerified: true,
};

function fakeRecipe(i: number) {
  return {
    id: `33333333-0000-4000-8000-${String(i).padStart(12, "0")}`,
    familyId: FAMILY_ID,
    title: `Ricetta di prova ${i}`,
    description: `Descrizione lunga della ricetta di prova numero ${i}, per riempire la card.`,
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    steps: ["Passo 1", "Passo 2"],
    tags: { cuisine: "italiana", difficulty: "facile", diet: [] },
    imageUrl: null,
    source: i % 2 === 0 ? "ai" : "manual",
    createdAt: new Date(2026, 0, i + 1).toISOString(),
  };
}
const RECIPES = Array.from({ length: 12 }, (_, i) => fakeRecipe(i + 1));

let browser: Browser;
let context: BrowserContext;
let page: Page;
/** Conta i tap effettuati sul pulsante Genera che hanno prodotto la chiamata AI. */
let aiSearchCalls = 0;

async function stubApi(pg: Page) {
  // La web-build locale può essere stata esportata SENZA EXPO_PUBLIC_DOMAIN
  // (in produzione lo inietta scripts/build.js): in quel caso getApiUrl()
  // contiene un `throw` inlinato. Lo riscriviamo al volo nel bundle servito,
  // così l'app punta a BASE_URL; le /api restano comunque tutte stubbate.
  await pg.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  // Intercetta OGNI chiamata /api/** verso qualunque host (la web-build punta
  // al dominio di produzione: qui non deve uscire nessuna richiesta reale).
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
          myMemberId: "44444444-4444-4444-8444-444444444444",
          subscriptionStatus: "free",
        },
      ]);
    if (path === `/api/families/${FAMILY_ID}`)
      return json({ id: FAMILY_ID, name: "Famiglia E2E", members: [] });
    if (path === `/api/recipes/${FAMILY_ID}/recipes` && method === "GET")
      return json(RECIPES);
    if (path === `/api/ai/${FAMILY_ID}/recipe-search` && method === "POST") {
      aiSearchCalls += 1;
      return json({ recipes: [fakeRecipe(99)] });
    }
    if (path.startsWith("/api/ai/")) return json({ recipes: [] });
    // Qualsiasi altra GET risponde con lista vuota, le altre con oggetto vuoto.
    return json(method === "GET" ? [] : {});
  });
}

// Gesto touch verticale (swipe) via CDP: è l'equivalente dello scroll col
// dito sui telefoni, che la FlatList di react-native-web gestisce davvero
// (gli eventi wheel non bastano a simularlo).
async function touchSwipe(ctx: BrowserContext, pg: Page, fromY: number, toY: number) {
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 195, y: fromY }],
  });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 195, y: fromY + ((toY - fromY) * i) / steps }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

// Riporta la lista in cima (swipe verso il basso ripetuti).
async function scrollListToTop(ctx: BrowserContext, pg: Page) {
  for (let i = 0; i < 6; i++) {
    await touchSwipe(ctx, pg, 200, 650);
  }
  await pg.waitForTimeout(300);
}

async function activePlaceholder(pg: Page): Promise<string | null> {
  return pg.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return el && "placeholder" in el ? el.placeholder : null;
  });
}

describe("Pagina Ricette con tastiera aperta (mobile web)", () => {
  before(async () => {
    // Verifica che il backend dev stia servendo la web-build.
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
      viewport: { width: 390, height: 700 },
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

    await page.goto(`${BASE_URL}/recipes`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // La pagina è pronta quando compaiono l'input AI e le card delle ricette.
    await page
      .locator('input[placeholder^="Chiedi una ricetta"]')
      .waitFor({ state: "visible", timeout: 60000 });
    await page.getByText("Ricetta di prova 1").first().waitFor({ timeout: 30000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("un solo tap dà il focus all'input AI e la digitazione funziona", async () => {
    const aiInput = page.locator('input[placeholder^="Chiedi una ricetta"]');
    await aiInput.tap();
    const ph = await activePlaceholder(page);
    assert.ok(
      ph?.startsWith("Chiedi una ricetta"),
      `l'input AI deve avere il focus dopo UN tap (activeElement: ${ph})`
    );
    await page.keyboard.type("lasagne");
    assert.equal(await aiInput.inputValue(), "lasagne");
    // Il focus non deve andare perso digitando (nessun re-render che smonta l'input).
    assert.ok((await activePlaceholder(page))?.startsWith("Chiedi una ricetta"));
  });

  test("con la tastiera aperta, un solo tap sposta il focus sull'input ricette salvate", async () => {
    const savedInput = page.locator('input[placeholder^="Cerca tra le ricette salvate"]');
    await savedInput.scrollIntoViewIfNeeded();
    await savedInput.tap();
    const ph = await activePlaceholder(page);
    assert.ok(
      ph?.startsWith("Cerca tra le ricette salvate"),
      `l'input ricette salvate deve prendere il focus al PRIMO tap (activeElement: ${ph})`
    );
    await page.keyboard.type("prova 3");
    // Il filtro locale reagisce mentre si digita: la lista resta usabile.
    await page.getByText(/ricett\w* salvat\w* per "prova 3"/).waitFor({ timeout: 10000 });
    await page.getByText("Ricetta di prova 3").first().waitFor({ timeout: 10000 });
    // Pulisce il filtro per i test successivi.
    await savedInput.fill("");
  });

  test("l'header dei controlli scorre insieme alle card, la nav bar resta fissa", async () => {
    // Riparte dalla cima della lista.
    await scrollListToTop(context, page);

    const generateBtn = page.getByText("Genera ricette con", { exact: false }).first();
    const navTitle = page.getByText("Le Mie Ricette").first();
    const firstCard = page.getByText("Ricetta di prova 1").first();

    const btnBefore = await generateBtn.boundingBox();
    const navBefore = await navTitle.boundingBox();
    const cardBefore = await firstCard.boundingBox();
    assert.ok(btnBefore && navBefore && cardBefore, "elementi visibili prima dello scroll");

    // Scroll touch verso l'alto sopra la lista (dito che trascina in su).
    await touchSwipe(context, page, 550, 200);
    // Attende che l'inerzia dello scroll si esaurisca prima di misurare,
    // altrimenti le due misure (header e card) fotografano istanti diversi.
    let cardAfter = await firstCard.boundingBox();
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const next = await firstCard.boundingBox();
      if (
        (next === null && cardAfter === null) ||
        (next && cardAfter && Math.abs(next.y - cardAfter.y) < 1)
      ) {
        cardAfter = next;
        break;
      }
      cardAfter = next;
    }

    const btnAfter = await generateBtn.boundingBox();
    const navAfter = await navTitle.boundingBox();

    assert.ok(navAfter, "la nav bar deve restare visibile");
    assert.ok(
      Math.abs(navAfter!.y - navBefore!.y) < 2,
      "la barra di navigazione deve restare fissa"
    );
    // L'header dei controlli DEVE muoversi con lo scroll: se resta fermo è
    // tornato fisso e il test fallisce.
    const btnMoved = !btnAfter || btnBefore!.y - btnAfter.y > 100;
    assert.ok(
      btnMoved,
      `il pulsante Genera deve scorrere con la lista (y prima=${btnBefore!.y}, dopo=${btnAfter?.y})`
    );
    // E deve muoversi INSIEME alle card (stesso scroll container).
    if (btnAfter && cardAfter) {
      const btnDelta = btnBefore!.y - btnAfter.y;
      const cardDelta = cardBefore!.y - cardAfter.y;
      assert.ok(
        Math.abs(btnDelta - cardDelta) < 5,
        `header e card devono scorrere insieme (delta header=${btnDelta}, delta card=${cardDelta})`
      );
    }
  });

  test("tap sul pulsante Genera con tastiera aperta: parte al primo colpo", async () => {
    // Torna in cima e riapre la "tastiera" (focus sull'input AI con testo).
    await scrollListToTop(context, page);
    const aiInput = page.locator('input[placeholder^="Chiedi una ricetta"]');
    await aiInput.tap();
    await aiInput.fill("lasagne");
    assert.ok((await activePlaceholder(page))?.startsWith("Chiedi una ricetta"));

    const callsBefore = aiSearchCalls;
    // UN solo tap sul pulsante mentre l'input è focalizzato.
    await page.getByText('Genera ricette con "lasagne"').first().tap();
    // La ricerca AI stubbata parte e la app naviga alla preview.
    await page.waitForURL(/\/recipes\/preview/, { timeout: 15000 });
    assert.equal(
      aiSearchCalls,
      callsBefore + 1,
      "il primo tap con tastiera aperta deve avviare la ricerca AI"
    );

    // Torna alla lista per il test successivo.
    await page.goBack();
    await page
      .locator('input[placeholder^="Chiedi una ricetta"]')
      .waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Ricetta di prova 1").first().waitFor({ timeout: 15000 });
  });

  test("swipe verso il basso in cima (pull-to-refresh) non rompe lo scroll della lista", async () => {
    // In cima alla lista: gesto touch verso il basso (pull-to-refresh su nativo).
    await scrollListToTop(context, page);

    // Pull-down in cima: non deve mandare in errore la pagina.
    await touchSwipe(context, page, 250, 550);
    await page.waitForTimeout(500);
    await page.getByText("Ricetta di prova 1").first().waitFor({ timeout: 10000 });

    // Subito dopo, lo scroll verso l'alto (swipe up) deve continuare a funzionare.
    const firstCard = page.getByText("Ricetta di prova 1").first();
    const before = await firstCard.boundingBox();
    await touchSwipe(context, page, 550, 200);
    await page.waitForTimeout(500);
    const after = await firstCard.boundingBox();
    const scrolled = !after || (before && before.y - after.y > 40);
    assert.ok(
      scrolled,
      `dopo il gesto di pull la lista deve ancora scorrere (y prima=${before?.y}, dopo=${after?.y})`
    );
  });
});
