/**
 * Test UI (Playwright) di regressione per il crash React #185 con account
 * autenticato ma email NON verificata e onboarding incompleto.
 *
 * Bug storico: AuthGate rimbalzava all'infinito tra /verify-email e
 * /onboarding (needsVerification + needsOnboarding entrambi true) causando
 * "Minified React error #185" (maximum update depth) e la schermata di crash.
 * La guardia `!needsVerification` sul ramo onboarding ha risolto: prima si
 * verifica l'email, poi si completa l'onboarding.
 *
 * Copre:
 *  1. '/' con utente autenticato non verificato + onboarding incompleto →
 *     schermata "Verifica la tua email", nessun crash/#185;
 *  2. link invito /join/<token> nello stesso stato → stessa schermata di
 *     verifica, nessun crash;
 *  3. transizione completa: dopo la verifica (flip di emailVerified nello
 *     stub di /api/auth/me) "Ho verificato, continua" porta a /onboarding;
 *     completato l'onboarding (flip di needsOnboarding) si arriva alla home.
 *
 * Tutte le /api/** sono stubbate (nessun DB reale). Requisiti: backend dev
 * attivo su http://localhost:5000 (serve la web-build).
 *
 * Esecuzione: npx tsx e2e/unverified-email-gate.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";

let browser: Browser;
let context: BrowserContext;

// Stato mutabile dell'utente restituito dallo stub di /api/auth/me: i test di
// transizione lo flippano per simulare verifica email e onboarding completato.
const me = {
  id: "e2e-user-unverified",
  email: "e2e-unverified@test.local",
  name: "E2E Non Verificato",
  avatarUrl: null as string | null,
  emailVerified: false,
  ageBand: null as string | null,
  isChildAccount: false,
  needsOnboarding: true,
  privacyPolicyUpdated: false,
  privacyPolicyVersion: null as string | null,
};

type Crash = { errors: string[] };

async function newAppPage(path: string): Promise<{ page: Page; crash: Crash }> {
  const page = await context.newPage();
  const crash: Crash = { errors: [] };

  // Il crash storico si manifestava come uncaught "Minified React error #185".
  page.on("pageerror", (err) => crash.errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") crash.errors.push(msg.text());
  });

  // Sessione autenticata: su web AsyncStorage è localStorage.
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [
      "@family_sync_auth",
      JSON.stringify({
        user: { ...me },
        accessToken: "e2e-access-token",
        refreshToken: "e2e-refresh-token",
      }),
    ] as [string, string]
  );

  // Bundle locale esportato senza EXPO_PUBLIC_DOMAIN: riscriviamo il throw
  // inlinato di getApiUrl() (stesso workaround degli altri test e2e).
  await page.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  // Stub API. NB: Playwright dà precedenza all'ULTIMA route registrata,
  // quindi la generica va per prima. Risponde `[]` perché i provider globali
  // (es. FamilyProvider) si aspettano liste: con `{}` crasherebbero
  // (".find is not a function") mascherando il crash sotto test.
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(me),
    });
  });
  await page.route("**/api/invites/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ familyName: "Famiglia E2E", email: me.email }),
    });
  });

  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  return { page, crash };
}

async function assertNoCrash(page: Page, crash: Crash) {
  const body = await page.locator("body").innerText();
  assert.doesNotMatch(body, /Something went wrong/i, "l'ErrorBoundary NON deve comparire");
  const react185 = crash.errors.filter((e) =>
    /error #185|Maximum update depth/i.test(e)
  );
  assert.deepEqual(react185, [], `crash React #185 rilevato: ${react185[0] ?? ""}`);
}

async function assertVerifyScreen(page: Page, crash: Crash) {
  await page
    .getByText("Verifica la tua email", { exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });
  const body = await page.locator("body").innerText();
  assert.match(body, /Ho verificato, continua/i, "bottone di verifica atteso");
  await assertNoCrash(page, crash);
}

describe("account con email non verificata: niente crash React #185", () => {
  before(async () => {
    // Guardia anti-anteprima-vecchia: la web-build servita deve contenere la
    // schermata di verifica, altrimenti falsi esiti su una build stantia.
    const html = await fetch(`${BASE_URL}/`).then((r) => r.text());
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch![0]}`).then((r) => r.text());
    assert.ok(
      bundle.includes("Verifica la tua email"),
      "La web-build servita NON contiene la schermata di verifica email: rigenerare la web-build (anteprima vecchia)"
    );

    browser = await chromium.launch({
      executablePath:
        process.env.E2E_CHROMIUM_PATH ||
        "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({ viewport: { width: 420, height: 800 } });
  });

  after(async () => {
    await browser?.close();
  });

  test("apertura di '/' → schermata 'Verifica la tua email' senza crash", async () => {
    me.emailVerified = false;
    me.needsOnboarding = true;
    const { page, crash } = await newAppPage("/");
    await assertVerifyScreen(page, crash);
    assert.match(page.url(), /\/verify-email/, "AuthGate deve reindirizzare a /verify-email");
    await page.close();
  });

  test("apertura di un link invito → schermata 'Verifica la tua email' senza crash", async () => {
    me.emailVerified = false;
    me.needsOnboarding = true;
    const { page, crash } = await newAppPage("/join/E2ETESTTOKEN");
    await assertVerifyScreen(page, crash);
    await page.close();
  });

  test("transizione: verifica email → onboarding → home", async () => {
    me.emailVerified = false;
    me.needsOnboarding = true;
    const { page, crash } = await newAppPage("/");
    await assertVerifyScreen(page, crash);

    // L'utente clicca il link nell'email: da qui /api/auth/me risponde
    // emailVerified=true (onboarding ancora incompleto).
    me.emailVerified = true;
    await page.getByText("Ho verificato, continua", { exact: true }).click();

    // AuthGate deve ora portare all'onboarding (NON alla home, NON in loop).
    await page.getByTestId("submit-button").waitFor({ state: "visible", timeout: 30_000 });
    assert.match(page.url(), /\/onboarding/, "dopo la verifica si va a /onboarding");
    await assertNoCrash(page, crash);
    await page.close();

    // Onboarding completato: nuova apertura di '/' deve restare sulla home.
    me.needsOnboarding = false;
    const { page: home, crash: homeCrash } = await newAppPage("/");
    await home
      .getByText(/Benvenuto/i)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    assert.doesNotMatch(home.url(), /verify-email|onboarding/, "utente completo → home");
    await assertNoCrash(home, homeCrash);
    await home.close();
  });
});
