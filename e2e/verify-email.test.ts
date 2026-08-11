/**
 * Test UI (Playwright) end-to-end per il link di conferma email
 * /verify-email/<token> (regressione: per settimane il link portava a una
 * pagina inesistente senza che nessun test lo rilevasse).
 *
 * A differenza degli altri test e2e, qui le /api NON sono stubbate: si usa
 * il backend dev reale e il DB dev reale, perché il punto è verificare che
 * l'intera catena (pagina web → POST /api/auth/verify-email → flip di
 * users.email_verified → cancellazione token) funzioni davvero.
 *
 * Copre:
 *  1. token valido  → schermata "Email verificata!" (verify-success-title),
 *     users.email_verified passa a true, il token viene cancellato (monouso);
 *  2. token inesistente → "Link non valido" (verify-error-title);
 *  3. token scaduto → "Link scaduto" (verify-error-title) e email_verified
 *     resta false.
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build)
 * e DATABASE_URL puntato al DB di sviluppo.
 *
 * Esecuzione: npx tsx e2e/verify-email.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Client } from "pg";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";

// Marker riconoscibile per il cleanup: tutto ciò che creiamo usa questa email.
const TEST_EMAIL = `e2e-verify-email-${Date.now()}@test.local`;

let browser: Browser;
let context: BrowserContext;
let db: Client;
let userId: string;

const validToken = `e2e-valid-${randomUUID()}`;
const expiredToken = `e2e-expired-${randomUUID()}`;
const missingToken = `e2e-missing-${randomUUID()}`;

async function openVerifyPage(token: string): Promise<Page> {
  const page = await context.newPage();

  // Bundle locale esportato senza EXPO_PUBLIC_DOMAIN: riscriviamo il throw
  // inlinato di getApiUrl() (stesso workaround degli altri test e2e), così
  // l'app punta al backend dev reale. Le /api NON vengono stubbate.
  await page.route("**/_expo/static/js/**", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`
    );
    await route.fulfill({ response: res, body });
  });

  await page.goto(`${BASE_URL}/verify-email/${token}`, {
    waitUntil: "domcontentloaded",
  });
  return page;
}

async function emailVerified(): Promise<boolean> {
  const r = await db.query("SELECT email_verified FROM users WHERE id = $1", [userId]);
  return r.rows[0]?.email_verified === true;
}

describe("link di conferma email /verify-email/<token>", () => {
  before(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL non impostata: serve il DB di sviluppo");
    }
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();

    // Guardia anti-anteprima-vecchia: la web-build servita deve contenere la
    // pagina di verifica (testID), altrimenti il test darebbe un falso negativo
    // su una build stantia. Fail con messaggio esplicito.
    const html = await fetch(`${BASE_URL}/`).then((r) => r.text());
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch![0]}`).then((r) => r.text());
    assert.ok(
      bundle.includes("verify-success-title"),
      "La web-build servita NON contiene la pagina /verify-email/[token]: rigenerare la web-build (anteprima vecchia)"
    );

    // Utente di test non verificato + token valido e token scaduto.
    const u = await db.query(
      `INSERT INTO users (email, name, email_verified) VALUES ($1, $2, false) RETURNING id`,
      [TEST_EMAIL, "E2E Verify Email"]
    );
    userId = u.rows[0].id;
    await db.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES
         ($1, $2, NOW() + INTERVAL '6 hours'),
         ($1, $3, NOW() - INTERVAL '1 hour')`,
      [userId, validToken, expiredToken]
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
    // Cleanup: la cancellazione dell'utente elimina anche i token (cascade).
    if (db) {
      if (userId) await db.query("DELETE FROM users WHERE id = $1", [userId]);
      await db.end();
    }
  });

  test("token scaduto → 'Link scaduto', email_verified resta false", async () => {
    // Eseguito PRIMA del token valido: sullo stesso utente, così verifichiamo
    // che un token scaduto non flippi email_verified.
    const page = await openVerifyPage(expiredToken);
    const title = page.getByTestId("verify-error-title");
    await title.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await title.innerText(), /Link scaduto/i);
    assert.equal(await emailVerified(), false, "email_verified NON deve flippare con token scaduto");
    await page.close();
  });

  test("token inesistente → 'Link non valido'", async () => {
    const page = await openVerifyPage(missingToken);
    const title = page.getByTestId("verify-error-title");
    await title.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await title.innerText(), /Link non valido/i);
    await page.close();
  });

  test("token valido → 'Email verificata!', flip di email_verified e token monouso", async () => {
    const page = await openVerifyPage(validToken);
    const title = page.getByTestId("verify-success-title");
    await title.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await title.innerText(), /Email verificata/i);

    assert.equal(await emailVerified(), true, "email_verified deve diventare true");
    const tok = await db.query(
      "SELECT 1 FROM email_verification_tokens WHERE token = $1",
      [validToken]
    );
    assert.equal(tok.rowCount, 0, "il token deve essere cancellato dopo l'uso (monouso)");

    // Riaprire lo stesso link deve ora dare 'Link non valido' (già usato).
    const page2 = await openVerifyPage(validToken);
    const errTitle = page2.getByTestId("verify-error-title");
    await errTitle.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await errTitle.innerText(), /Link non valido/i);
    await page2.close();
    await page.close();
  });
});
