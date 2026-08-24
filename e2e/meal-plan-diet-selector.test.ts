/**
 * Test UI (Playwright, viewport mobile) del selettore Dieta nel Piano Pasti.
 *
 * Verifica end-to-end sulla web-build reale che una sessione demo autenticata:
 * - visualizzi un dropdown chiuso e nessun campo Allergie/intolleranze;
 * - apra il menu e aggiorni il valore scelto;
 * - invii il profilo scelto allo stream AI, senza raggiungere il backend;
 * - non salvi alcun piano e non consumi AI reale.
 *
 * Non usa la password demo: la sessione autenticata è inserita nello storage
 * del browser prima del caricamento, mentre tutte le API sono stubbate.
 *
 * Esecuzione: npx tsx --test e2e/meal-plan-diet-selector.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  MEAL_PLAN_DIET_PROFILES,
  mealPlanDietProfileLabel,
  type MealPlanDietProfile,
} from "../shared/meal-plan-diet-profiles";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  // Account demo simulato: nessuna credenziale o secret nel repository.
  email: "demo@familysync.eu",
  name: "Demo FamilySync",
  emailVerified: true,
};

const SELECTED_PROFILE: MealPlanDietProfile = "lactose_free";
const AI_STREAM_PATH = `/api/ai/${FAMILY_ID}/weekly-meal-plan/stream`;
const SAVE_PATH = `/api/meal-plans/${FAMILY_ID}/meal-plans`;
const DEMO_ITEMS = [{
  date: "2030-03-04",
  mealType: "lunch",
  title: "Pranzo demo verificato",
  description: "Pasto locale usato esclusivamente dallo stub E2E.",
  ingredients: [{ name: "Riso", quantity: "80", unit: "g" }],
  steps: ["Prepara.", "Cuoci.", "Servi."],
}];

/** Body ricevuti dallo stream AI sintetico: non arriva mai al backend. */
const aiRequestBodies: unknown[] = [];
/** Ogni eventuale POST di salvataggio: deve restare vuoto. */
const savePostBodies: unknown[] = [];

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function stubApi(pg: Page) {
  // La web-build locale può essere stata esportata senza EXPO_PUBLIC_DOMAIN.
  // Forziamo getApiUrl() verso il backend di test, poi intercettiamo TUTTE le
  // API prima che possano lasciare il browser.
  await pg.route("**/_expo/static/js/**", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`,
    );
    await route.fulfill({ response, body });
  });

  await pg.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/auth/me") return json(USER);
    if (path === "/api/families" && method === "GET") {
      return json([{
        id: FAMILY_ID,
        name: "Famiglia Demo",
        myRole: "admin",
        myMemberId: "33333333-3333-4333-8333-333333333333",
        subscriptionStatus: "free",
      }]);
    }
    if (path === "/api/moderation/preferences") return json({ aiFeaturesEnabled: true });
    if (path === `/api/meal-plans/${FAMILY_ID}/meal-plans` && method === "GET") return json([]);

    if (path === AI_STREAM_PATH && method === "POST") {
      const requestBody = request.postDataJSON() as {
        requestId?: string;
        preferences?: { dietProfile?: MealPlanDietProfile };
      };
      aiRequestBodies.push(requestBody);
      const requestId = requestBody.requestId || "missing-request-id";
      const dietProfile = requestBody.preferences?.dietProfile || "mediterranean";
      // Lo stream manda prima un evento riferito a una richiesta precedente:
      // l'interfaccia deve ignorarlo, quindi accettare solo l'evento correlato
      // alla richiesta attiva e allo stesso profilo.
      return route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({
            type: "done",
            requestId: "mealplan-stale-response",
            dietProfile: "mediterranean",
            title: "Piano obsoleto da ignorare",
            weekStartDate: "2030-03-04",
            items: DEMO_ITEMS,
          }),
          JSON.stringify({
            type: "done",
            requestId,
            dietProfile,
            title: "Piano demo verificato",
            weekStartDate: "2030-03-04",
            items: DEMO_ITEMS,
          }),
        ].join("\n") + "\n",
      });
    }

    if (path === SAVE_PATH && method === "POST") {
      savePostBodies.push(request.postDataJSON());
      return json({ id: "should-not-save" }, 201);
    }

    // Qualsiasi endpoint secondario resta isolato e non chiama il backend.
    return json(method === "GET" ? [] : {});
  });
}

async function waitForAiRequest() {
  for (let attempt = 0; attempt < 100 && aiRequestBodies.length === 0; attempt++) {
    await page.waitForTimeout(100);
  }
  assert.equal(aiRequestBodies.length, 1, "deve partire esattamente uno stream AI intercettato");
}

async function dismissWebUpdateBanner(pg: Page) {
  // Il controllo staleness arriva in background e può montare il banner subito
  // dopo il primo dismiss. Aspettiamo due giri consecutivi senza banner prima
  // di proseguire con i tap del flusso sotto test.
  let idleRounds = 0;
  for (let round = 0; round < 8 && idleRounds < 2; round++) {
    let dismissed = false;
    for (const testId of ["web-stale-dismiss", "web-update-dismiss"]) {
      const dismiss = pg.getByTestId(testId);
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.tap({ force: true });
        dismissed = true;
      }
    }
    idleRounds = dismissed ? 0 : idleRounds + 1;
    await pg.waitForTimeout(150);
  }
}

describe("Selettore Dieta nel Piano Pasti", () => {
  before(async () => {
    const response = await fetch(BASE_URL).catch(() => null);
    if (!response?.ok) {
      throw new Error(`Backend non raggiungibile su ${BASE_URL}: avviare il workflow "Start Backend"`);
    }

    // Evita un falso verde se il backend sta ancora servendo un export web
    // precedente, privo del selettore Dieta che questo test deve esercitare.
    const html = await response.text();
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch[0]}`).then((res) => res.text());
    assert.ok(
      bundle.includes("Senza lattosio"),
      "La web-build servita non contiene il nuovo selettore Dieta: rigenerare la web-build (anteprima vecchia)",
    );

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
            accessToken: "e2e-demo-access-token",
            refreshToken: "e2e-demo-refresh-token",
          }),
        );
        localStorage.setItem(familyKey, familyId);
      },
      { authKey: AUTH_KEY, familyKey: ACTIVE_FAMILY_KEY, familyId: FAMILY_ID, user: USER },
    );

    await page.goto(`${BASE_URL}/meal-plans`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByText("I Miei Piani").first().waitFor({ timeout: 60_000 });
    await dismissWebUpdateBanner(page);
    await page.getByText("Genera con AI").first().tap();
    await page.getByTestId("mealplan-diet-selector").waitFor({ state: "visible", timeout: 15_000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("mostra il dropdown Dieta chiuso, inizialmente Mediterranea e senza Allergie/intolleranze", async () => {
    const selector = page.getByTestId("mealplan-diet-selector");
    assert.equal(await selector.count(), 1, "il campo Dieta deve comparire una sola volta");
    assert.equal(
      await page.getByTestId("mealplan-diet-selected-value").innerText(),
      mealPlanDietProfileLabel("mediterranean"),
      "Mediterranea deve essere il valore iniziale",
    );
    assert.equal(
      await page.getByTestId(`mealplan-diet-option-${SELECTED_PROFILE}`).count(),
      0,
      "il menu deve restare chiuso finché non viene toccato",
    );
    assert.equal(
      await page.getByText(/allergie|intolleranze/i).count(),
      0,
      "la schermata non deve offrire Allergie/intolleranze nel selettore Dieta",
    );
  });

  test("apre il dropdown, mostra solo sette profili, seleziona Senza lattosio e ignora risposte stale", async () => {
    await page.getByTestId("mealplan-diet-selector").tap();
    for (const profile of MEAL_PLAN_DIET_PROFILES) {
      const option = page.getByTestId(`mealplan-diet-option-${profile}`);
      assert.equal(await option.count(), 1, `l'opzione ${profile} deve comparire nel menu`);
      assert.ok(
        (await option.innerText()).includes(mealPlanDietProfileLabel(profile)),
        `etichetta corretta per ${profile}`,
      );
    }
    assert.equal(
      await page.locator('[data-testid^="mealplan-diet-option-"]').count(),
      7,
      "il menu deve mostrare esattamente i sette profili definitivi",
    );
    for (const retired of ["mediterranean_gluten_free", "mediterranean_lactose_free", "vegetarian_gluten_free"]) {
      assert.equal(
        await page.getByTestId(`mealplan-diet-option-${retired}`).count(),
        0,
        `${retired} non deve più comparire nel menu`,
      );
    }

    await page.getByTestId(`mealplan-diet-option-${SELECTED_PROFILE}`).tap();
    await page.getByTestId(`mealplan-diet-option-${SELECTED_PROFILE}`).waitFor({ state: "detached" });
    assert.equal(
      await page.getByTestId("mealplan-diet-selected-value").innerText(),
      mealPlanDietProfileLabel(SELECTED_PROFILE),
      "il valore scelto deve restare visibile dopo la chiusura del menu",
    );

    // Il controllo staleness è rieseguito in background: può aprire di nuovo
    // il banner tra la scelta del profilo e il tap di generazione.
    await dismissWebUpdateBanner(page);
    await page.getByText("Genera Piano").first().tap();
    await waitForAiRequest();

    const body = aiRequestBodies[0] as { requestId?: unknown; preferences?: unknown };
    assert.deepEqual(
      body.preferences,
      { dietProfile: SELECTED_PROFILE },
      "la richiesta AI deve contenere esclusivamente il dietProfile selezionato nelle preferences",
    );
    assert.match(
      String(body.requestId),
      /^mealplan-\d+-\d+$/,
      "ogni stream deve dichiarare un requestId opaco",
    );
    await page.getByText("Piano demo verificato").waitFor({ timeout: 10_000 });
    assert.equal(
      await page.getByText("Piano obsoleto da ignorare").count(),
      0,
      "una risposta con requestId o profilo diverso non deve aggiornare l'anteprima",
    );
    assert.equal(
      savePostBodies.length,
      0,
      "generare l'anteprima non deve eseguire POST di salvataggio",
    );
  });
});
