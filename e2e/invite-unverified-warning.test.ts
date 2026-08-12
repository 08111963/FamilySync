/**
 * Test UI (Playwright): un utente autenticato ma con email NON verificata che
 * apre un link invito (/join/<token> o /join-link/<code>) deve vedere SUBITO
 * l'avviso dedicato "Verifica prima la tua email" con il bottone verso
 * /verify-email — non più l'errore generico dopo il tentativo di accettazione
 * (le rotte famiglia sono dietro requireEmailVerified).
 *
 * Copre:
 *  1. /join/<token> (invito personale, stessa email) → avviso dedicato +
 *     bottone "Vai alla verifica email" che porta a /verify-email;
 *  2. /join-link/<code> (link/QR riutilizzabile) → stesso avviso e bottone.
 *
 * Tutte le /api/** sono stubbate (nessun DB reale). Requisiti: backend dev
 * attivo su http://localhost:5000 (serve la web-build).
 *
 * Esecuzione: npx tsx e2e/invite-unverified-warning.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";

let browser: Browser;
let context: BrowserContext;

const me = {
  id: "e2e-user-invite-unverified",
  email: "e2e-invite-unverified@test.local",
  name: "E2E Invito Non Verificato",
  avatarUrl: null as string | null,
  emailVerified: false,
  ageBand: "adult" as string | null,
  isChildAccount: false,
  needsOnboarding: false,
  privacyPolicyUpdated: false,
  privacyPolicyVersion: null as string | null,
};

type Crash = { errors: string[] };

async function newAppPage(path: string): Promise<{ page: Page; crash: Crash }> {
  const page = await context.newPage();
  const crash: Crash = { errors: [] };

  page.on("pageerror", (err) => crash.errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") crash.errors.push(msg.text());
  });

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

  // Stub API: la generica per prima (Playwright dà precedenza all'ULTIMA).
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
  // Invito personale valido, stessa email dell'utente loggato.
  await page.route("**/api/invites/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "valid",
        email: me.email,
        invitedName: me.name,
        familyName: "Famiglia E2E",
        userExists: true,
      }),
    });
  });
  // Link/QR riutilizzabile valido.
  await page.route("**/api/join-link/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "valid", familyName: "Famiglia E2E" }),
    });
  });

  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  return { page, crash };
}

async function assertInviteWarning(page: Page, crash: Crash) {
  await page
    .getByText("Verifica prima la tua email", { exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });

  const body = await page.locator("body").innerText();
  assert.match(body, /Vai alla verifica email/i, "bottone verso la verifica atteso");
  assert.doesNotMatch(
    body,
    /Impossibile entrare nella famiglia|Impossibile accettare l'invito/i,
    "nessun errore generico deve comparire"
  );
  assert.doesNotMatch(body, /Something went wrong/i, "nessun crash ErrorBoundary");
  const react185 = crash.errors.filter((e) => /error #185|Maximum update depth/i.test(e));
  assert.deepEqual(react185, [], `crash React #185 rilevato: ${react185[0] ?? ""}`);

  // Il bottone porta alla schermata di verifica email.
  await page.getByText("Vai alla verifica email", { exact: true }).click();
  await page
    .getByText("Verifica la tua email", { exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });
  assert.match(page.url(), /\/verify-email/, "il bottone deve portare a /verify-email");
}

describe("pagine invito con email non verificata: avviso dedicato", () => {
  before(async () => {
    // Guardia anti-anteprima-vecchia: la web-build servita deve contenere il
    // nuovo avviso, altrimenti falsi esiti su una build stantia.
    const html = await fetch(`${BASE_URL}/`).then((r) => r.text());
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch![0]}`).then((r) => r.text());
    assert.ok(
      bundle.includes("Verifica prima la tua email"),
      "La web-build servita NON contiene il nuovo avviso: rigenerare la web-build (anteprima vecchia)"
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

  test("/join/<token> → avviso 'Verifica prima la tua email' con link alla verifica", async () => {
    const { page, crash } = await newAppPage("/join/E2ETESTTOKEN");
    await assertInviteWarning(page, crash);
    await page.close();
  });

  test("/join-link/<code> → avviso 'Verifica prima la tua email' con link alla verifica", async () => {
    const { page, crash } = await newAppPage("/join-link/E2ECODE");
    await assertInviteWarning(page, crash);
    await page.close();
  });
});
