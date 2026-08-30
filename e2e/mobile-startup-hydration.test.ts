/**
 * Regressione startup web mobile per l'export statico Expo.
 *
 * Verifica che il markup prerenderizzato e il primo render client coincidano
 * anche con viewport mobile, tema scuro e sessione salvata. Copre inoltre
 * reload, ingresso pubblico e ripristino della shell autenticata.
 *
 * Esecuzione: npx tsx e2e/mobile-startup-hydration.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const USER = {
  id: "e2e-mobile-startup",
  email: "mobile-startup@test.local",
  name: "Mobile Startup",
  emailVerified: true,
  needsOnboarding: false,
  isChildAccount: false,
};

let browser: Browser;
let context: BrowserContext;

function watchStartup(page: Page) {
  const messages: string[] = [];
  page.on("pageerror", (error) => messages.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      messages.push(message.text());
    }
  });
  return messages;
}

function assertCleanStartup(messages: string[]) {
  const relevant = messages.filter((message) =>
    /hydration|Minified React error #418|Something went wrong|No route named/i.test(message),
  );
  assert.deepEqual(relevant, [], `startup errors:\n${relevant.join("\n")}`);
}

async function stubApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/auth/me" ? USER : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

describe("startup mobile dell'export statico", () => {
  before(async () => {
    browser = await chromium.launch({
      executablePath:
        process.env.E2E_CHROMIUM_PATH ||
        "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      colorScheme: "dark",
      isMobile: true,
      hasTouch: true,
    });
  });

  after(async () => {
    await browser?.close();
  });

  test("ingresso pubblico e reload non producono mismatch", async () => {
    const page = await context.newPage();
    const messages = watchStartup(page);
    await stubApi(page);

    await page.goto(`${BASE_URL}/welcome`, { waitUntil: "networkidle" });
    await page.getByText("La tua famiglia, finalmente sincronizzata", { exact: true }).waitFor();
    assertCleanStartup(messages);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("La tua famiglia, finalmente sincronizzata", { exact: true }).waitFor();
    assertCleanStartup(messages);

    const getStarted = page.getByTestId("features-get-started-button");
    await getStarted.scrollIntoViewIfNeeded();
    await getStarted.click();
    await page.waitForURL(/\/login(?:\?|$)/);
    await page.getByText("Password dimenticata?", { exact: true }).waitFor({ state: "visible" });
    assert.match(page.url(), /\/login(?:\?|$)/);
    assertCleanStartup(messages);
    await page.close();
  });

  test("una route pubblica dinamica usa il proprio documento statico", async () => {
    const template = readFileSync("web-build/reset-password/[token].html", "utf8");
    const rootMarkup = template.match(/<div id="root">.*?<\/div>/s)?.[0];
    assert.ok(rootMarkup, "markup prerenderizzato reset-password mancante");

    const response = await fetch(`${BASE_URL}/reset-password/e2e-startup-token`);
    assert.equal(response.status, 200);
    const responseHtml = await response.text();
    assert.ok(
      responseHtml.includes(rootMarkup),
      "reset-password deve ricevere il proprio prerender, non la shell index generica",
    );

    const page = await context.newPage();
    const messages = watchStartup(page);
    await stubApi(page);
    await page.goto(`${BASE_URL}/reset-password/e2e-startup-token`, { waitUntil: "networkidle" });
    await page.getByTestId("new-password-input").waitFor({ state: "visible" });
    assertCleanStartup(messages);
    await page.close();
  });

  test("una sessione salvata ripristina la shell autenticata anche dopo reload", async () => {
    const page = await context.newPage();
    const messages = watchStartup(page);
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        AUTH_KEY,
        JSON.stringify({
          user: USER,
          accessToken: "e2e-access-token",
          refreshToken: "e2e-refresh-token",
        }),
      ] as [string, string],
    );
    await stubApi(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.getByText("Crea la tua Famiglia", { exact: true }).waitFor();
    assertCleanStartup(messages);

    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Crea la tua Famiglia", { exact: true }).waitFor();
    assertCleanStartup(messages);
    await page.close();
  });
});