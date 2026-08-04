/**
 * Test UI (Playwright) per il banner "anteprima web vecchia".
 *
 * Verifica che quando GET /build-version riporta staleness.status === "stale"
 * l'app web mostri il banner discreto (testID web-stale-banner) e che con
 * status "fresh" il banner NON appaia.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * /build-version e tutte le /api/** sono stubbate: nessun DB reale.
 *
 * Esecuzione: npx tsx e2e/stale-banner.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";

let browser: Browser;
let context: BrowserContext;

async function newPage(stalenessStatus: "stale" | "fresh"): Promise<Page> {
  const page = await context.newPage();

  // Bundle locale esportato senza EXPO_PUBLIC_DOMAIN: riscriviamo il throw
  // inlinato di getApiUrl() (stesso workaround di recipes-keyboard.test.ts).
  await page.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  // /build-version: manteniamo la version REALE del server (altrimenti
  // scatterebbe il banner "Nuova versione", che ha precedenza) e pilotiamo
  // solo lo stato di staleness.
  await page.route("**/build-version", async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    data.staleness = { status: stalenessStatus, webBuildMtime: 1, lastFrontendCommit: 2, note: "e2e" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });

  // Nessuna chiamata API reale.
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
  return page;
}

describe("banner anteprima web vecchia", () => {
  before(async () => {
    browser = await chromium.launch({
      executablePath: process.env.E2E_CHROMIUM_PATH ||
        "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({ viewport: { width: 420, height: 800 } });
  });

  after(async () => {
    await browser?.close();
  });

  test("mostra il banner quando staleness è stale", async () => {
    const page = await newPage("stale");
    const banner = page.getByTestId("web-stale-banner");
    await banner.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(
      await banner.innerText(),
      /anteprima potrebbe essere vecchia/i,
      "il banner deve contenere il testo di avviso"
    );
    // La X lo chiude.
    await page.getByTestId("web-stale-dismiss").click();
    await banner.waitFor({ state: "detached", timeout: 5_000 });
    await page.close();
  });

  test("nessun banner quando staleness è fresh", async () => {
    const page = await newPage("fresh");
    // Attende che l'app sia montata, poi verifica l'assenza del banner.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);
    assert.equal(
      await page.getByTestId("web-stale-banner").count(),
      0,
      "nessun banner atteso con build fresh"
    );
    await page.close();
  });
});
