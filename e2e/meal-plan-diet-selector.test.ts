/**
 * Test UI (Playwright, viewport mobile) del selettore Dieta nel Piano Pasti.
 *
 * Verifica end-to-end sulla web-build reale che una sessione demo autenticata:
 * - visualizzi i nove profili chiusi e nessun campo Allergie/intolleranze;
 * - aggiorni il radio attivo al cambio profilo;
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

const SELECTED_PROFILE: MealPlanDietProfile = "vegetarian_gluten_free";
const AI_STREAM_PATH = `/api/ai/${FAMILY_ID}/weekly-meal-plan/stream`;
const SAVE_PATH = `/api/meal-plans/${FAMILY_ID}/meal-plans`;

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
      aiRequestBodies.push(request.postDataJSON());
      // Risposta NDJSON deliberatamente minima e locale: è la prova che la
      // UI gestisce la richiesta senza consumo AI o backend reale.
      return route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: `${JSON.stringify({
          type: "done",
          title: "Piano demo senza consumo AI",
          weekStartDate: "2030-03-04",
          items: [],
        })}\n`,
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

describe("Selettore Dieta nel Piano Pasti", () => {
  before(async () => {
    const response = await fetch(BASE_URL).catch(() => null);
    if (!response?.ok) {
      throw new Error(`Backend non raggiungibile su ${BASE_URL}: avviare il workflow "Start Backend"`);
    }

    // Evita un falso verde se il backend sta ancora servendo un export web
    // precedente, privo dei radio che questo test deve esercitare.
    const html = await response.text();
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch[0]}`).then((res) => res.text());
    assert.ok(
      bundle.includes("Mediterranea senza glutine"),
      "La web-build servita non contiene il selettore Dieta: rigenerare la web-build (anteprima vecchia)",
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
    await page.getByText("Genera con AI").first().tap();
    await page.getByText("Dieta").first().waitFor({ timeout: 15_000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("mostra esattamente i nove profili chiusi, senza Allergie/intolleranze", async () => {
    for (const profile of MEAL_PLAN_DIET_PROFILES) {
      const radio = page.getByTestId(`mealplan-diet-${profile}`);
      assert.equal(await radio.count(), 1, `il radio ${profile} deve comparire una sola volta`);
      assert.ok(
        (await radio.innerText()).includes(mealPlanDietProfileLabel(profile)),
        `etichetta corretta per ${profile}`,
      );
    }

    const radios = page.getByRole("radio");
    assert.equal(await radios.count(), MEAL_PLAN_DIET_PROFILES.length, "devono comparire solo nove radio Dieta");
    assert.equal(
      await page.getByText(/allergie|intolleranze/i).count(),
      0,
      "la schermata non deve offrire Allergie/intolleranze nel selettore Dieta",
    );
  });

  test("cambia profilo, aggiorna il radio attivo e invia solo dietProfile allo stream intercettato", async () => {
    const defaultRadio = page.getByTestId("mealplan-diet-mediterranean");
    const selectedRadio = page.getByTestId(`mealplan-diet-${SELECTED_PROFILE}`);

    assert.equal(await defaultRadio.getAttribute("aria-checked"), "true", "Mediterranea è il default attivo");
    assert.equal(await selectedRadio.getAttribute("aria-checked"), "false", "il nuovo profilo parte inattivo");

    await selectedRadio.tap();

    assert.equal(await defaultRadio.getAttribute("aria-checked"), "false", "il profilo precedente deve diventare inattivo");
    assert.equal(await selectedRadio.getAttribute("aria-checked"), "true", "il radio selezionato deve risultare attivo");

    await page.getByText("Genera Piano").first().tap();
    await waitForAiRequest();

    const body = aiRequestBodies[0] as { preferences?: unknown };
    assert.deepEqual(
      body.preferences,
      { dietProfile: SELECTED_PROFILE },
      "la richiesta AI deve contenere esclusivamente il dietProfile selezionato nelle preferences",
    );
    assert.equal(
      savePostBodies.length,
      0,
      "generare l'anteprima non deve eseguire POST di salvataggio",
    );
  });
});
