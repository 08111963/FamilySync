/**
 * Test UI (Playwright) per /join-link/<code> nei browser in-app datati
 * (WhatsApp/Gmail su Android).
 *
 * Il crash "Something went wrong" era causato da metodi JS moderni usati dalle
 * dipendenze (es. react-navigation chiama `routes.findLast(...)`) che non
 * esistono sui WebView Android vecchi. Qui simuliamo quel motore RIMUOVENDO i
 * metodi moderni prima del caricamento del bundle (addInitScript) e verifichiamo
 * che i polyfill di lib/runtime-polyfills.ts tengano in piedi la pagina.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * Tutte le /api/** sono stubbate: nessun DB reale.
 *
 * Esecuzione: npx tsx e2e/join-link-webview.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const CODE = "E2ETESTCODE";

let browser: Browser;
let context: BrowserContext;

// Simula un WebView Android datato: elimina i metodi moderni che il bundle
// esportato usa (trovati con grep sul bundle). Se i polyfill non ci fossero,
// la navigazione di expo-router crasherebbe (TypeError: findLast is not a
// function) e comparirebbe l'ErrorBoundary.
const OLD_WEBVIEW_INIT = `
  delete Array.prototype.findLast;
  delete Array.prototype.findLastIndex;
  delete Array.prototype.toSorted;
  delete Array.prototype.toReversed;
  delete Array.prototype.at;
  delete String.prototype.at;
  delete String.prototype.replaceAll;
  delete Object.hasOwn;
  delete globalThis.structuredClone;
  // Caso reale (browser in-app WhatsApp su Android): ResizeObserver assente
  // crashava /join-link con "ResizeObserver is not defined".
  delete globalThis.ResizeObserver;
  delete window.matchMedia;
  if (globalThis.crypto) { try { delete globalThis.crypto.randomUUID; } catch (e) {} }
`;

async function newJoinPage(opts: { oldWebView: boolean }): Promise<Page> {
  const page = await context.newPage();

  if (opts.oldWebView) {
    await page.addInitScript(OLD_WEBVIEW_INIT);
  }

  // Bundle locale esportato senza EXPO_PUBLIC_DOMAIN: riscriviamo il throw
  // inlinato di getApiUrl() (stesso workaround di stale-banner.test.ts).
  await page.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  // Invito valido stubbato; ogni altra /api risponde vuoto. NB: Playwright dà
  // precedenza all'ULTIMA route registrata, quindi la generica va per prima.
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(`**/api/join-link/${CODE}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "valid", familyName: "Famiglia E2E" }),
    });
  });

  await page.goto(`${BASE_URL}/join-link/${CODE}`, { waitUntil: "domcontentloaded" });
  return page;
}

async function assertJoinScreenRenders(page: Page) {
  // La schermata "crea account" deve comparire (utente non autenticato).
  await page.getByTestId("input-email").waitFor({ state: "visible", timeout: 30_000 });
  const body = await page.locator("body").innerText();
  assert.match(body, /Unisciti a Famiglia E2E/i, "titolo invito atteso");
  assert.doesNotMatch(body, /Something went wrong/i, "l'ErrorBoundary NON deve comparire");
}

describe("join-link su WebView datato (browser in-app WhatsApp)", () => {
  before(async () => {
    browser = await chromium.launch({
      executablePath: process.env.E2E_CHROMIUM_PATH ||
        "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    // Viewport mobile + user agent del browser in-app di WhatsApp su Android.
    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 10; SM-A505F Build/QP1A.190711.020; wv) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/96.0.4664.45 Mobile Safari/537.36",
      isMobile: true,
      hasTouch: true,
    });
  });

  after(async () => {
    await browser?.close();
  });

  test("browser moderno: la pagina invito si apre (sanity check)", async () => {
    const page = await newJoinPage({ oldWebView: false });
    await assertJoinScreenRenders(page);
    await page.close();
  });

  test("WebView datato senza findLast/toSorted/etc: i polyfill evitano il crash", async () => {
    const page = await newJoinPage({ oldWebView: true });

    // Verifica che la simulazione sia effettiva e che i polyfill abbiano
    // ripristinato i metodi (altrimenti il test non proverebbe nulla).
    const restored = await page.evaluate(() => ({
      findLast: typeof (Array.prototype as any).findLast,
      toSorted: typeof (Array.prototype as any).toSorted,
      hasOwn: typeof (Object as any).hasOwn,
      structuredClone: typeof (globalThis as any).structuredClone,
      replaceAll: typeof (String.prototype as any).replaceAll,
    }));
    for (const [name, type] of Object.entries(restored)) {
      assert.equal(type, "function", `polyfill mancante per ${name}`);
    }

    await assertJoinScreenRenders(page);
    await page.close();
  });
});
