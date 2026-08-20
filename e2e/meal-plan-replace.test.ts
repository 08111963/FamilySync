/**
 * Test UI (Playwright, viewport mobile) della SOSTITUZIONE del piano pasti
 * (schermata Piano Pasti → "Genera con AI" → "Salva questo piano").
 *
 * Verifica end-to-end sull'interfaccia reale (web-build servita dal backend):
 *  1. Salvataggio normale: POST senza replace → 201, l'app passa alla tab
 *     "I Miei Piani" e mostra la scheda del piano.
 *  2. Piano esistente: il POST risponde 409 PLAN_EXISTS e compare il dialogo
 *     window.confirm "Esiste già un piano pasti per questa settimana. Vuoi
 *     sostituirlo con quello nuovo?".
 *  3. "Annulla" (dismiss del confirm): NESSUNA seconda POST con replace:true,
 *     il piano esistente resta invariato e il bottone "Salva questo piano"
 *     torna cliccabile (non resta bloccato sullo spinner).
 *  4. "Sostituisci" (accept del confirm): parte la POST con replace:true, il
 *     piano viene sostituito (nuovo id) e l'app torna a "I Miei Piani".
 *
 * Requisiti: backend dev attivo su http://localhost:5000 (serve la web-build).
 * Tutte le /api/** sono stubbate con stato in-memory (incluso lo stream AI:
 * nessuna chiamata AI reale, test deterministico). La logica server della
 * sostituzione atomica è coperta da server/__tests__/meal-plan-replace.test.ts.
 *
 * Esecuzione: npx tsx --test e2e/meal-plan-replace.test.ts
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
  email: "e2e-mealplan@test.local",
  name: "Tester E2E",
  emailVerified: true,
};

const CONFIRM_TEXT =
  "Esiste già un piano pasti per questa settimana. Vuoi sostituirlo con quello nuovo?";

/** Stato in-memory del "server": il piano salvato per la famiglia (o null). */
let serverPlan: { id: string; title: string; weekStartDate: string; items: any[] } | null = null;
let planSeq = 0;
let streamMode: "success" | "constraint-error" = "success";

/** Tutti i body ricevuti dalla POST di salvataggio piano. */
const postBodies: any[] = [];

const STREAM_ITEMS = [
  { date: "2030-03-04", mealType: "lunch", title: "Pasta al pomodoro E2E" },
  { date: "2030-03-05", mealType: "dinner", title: "Minestrone E2E" },
];

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
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/auth/me") return json(USER);
    if (path === "/api/families" && method === "GET")
      return json([{ id: FAMILY_ID, name: "Famiglia E2E", myRole: "admin", subscriptionStatus: "free" }]);
    if (path === "/api/moderation/preferences") return json({ aiFeaturesEnabled: true });

    // Stream AI stubbato: due pasti + done, formato NDJSON come il backend vero.
    if (path === `/api/ai/${FAMILY_ID}/weekly-meal-plan/stream` && method === "POST") {
      if (streamMode === "constraint-error") {
        return json({
          error: {
            code: "AI_CONSTRAINT_VIOLATION",
            message: "Non è stato possibile creare un piano verificato dopo più tentativi. Le preferenze sono rimaste compilate: riprova.",
          },
        }, 422);
      }
      const lines = [
        JSON.stringify({ type: "items", items: STREAM_ITEMS }),
        JSON.stringify({ type: "done", title: "Piano Settimanale E2E" }),
      ].join("\n");
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines });
    }

    // Salvataggio piano: replica il contratto del backend vero
    // (server/routes/meal-plans.ts): 409 PLAN_EXISTS senza replace, 201 con
    // replace=true (sostituzione: nuovo id).
    if (path === `/api/meal-plans/${FAMILY_ID}/meal-plans` && method === "POST") {
      const body = route.request().postDataJSON();
      postBodies.push(body);
      if (!body.replace && serverPlan) {
        return json(
          { error: { code: "PLAN_EXISTS", message: "Esiste già un piano pasti per questa settimana.", planId: serverPlan.id } },
          409
        );
      }
      serverPlan = {
        id: `plan-${++planSeq}`,
        title: body.title,
        weekStartDate: body.weekStartDate,
        items: body.items,
      };
      return json({ ...serverPlan }, 201);
    }

    if (path === `/api/meal-plans/${FAMILY_ID}/meal-plans` && method === "GET")
      return json(serverPlan ? [{ ...serverPlan }] : []);

    // Qualsiasi altra GET risponde con lista vuota, le altre con oggetto vuoto.
    return json(method === "GET" ? [] : {});
  });
}

async function generatePlan() {
  await page.getByText("Genera con AI").first().tap();
  await page.getByText("Genera Piano").first().waitFor({ timeout: 15000 });
  await page.getByText("Genera Piano").first().tap();
  await page.getByText("Salva questo piano").first().waitFor({ timeout: 15000 });
  // Il piano generato (stub) deve essere visibile in anteprima.
  await page.getByText("Pasta al pomodoro E2E").first().waitFor({ timeout: 15000 });
}

describe("Sostituzione piano pasti (Salva → conferma / Annulla)", () => {
  before(async () => {
    const res = await fetch(BASE_URL).catch(() => null);
    if (!res || !res.ok) {
      throw new Error(`Backend non raggiungibile su ${BASE_URL}: avviare il workflow "Start Backend"`);
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
          JSON.stringify({ user, accessToken: "e2e-fake-access-token", refreshToken: "e2e-fake-refresh-token" })
        );
        localStorage.setItem(familyKey, familyId);
      },
      { authKey: AUTH_KEY, familyKey: ACTIVE_FAMILY_KEY, familyId: FAMILY_ID, user: USER }
    );

    await page.goto(`${BASE_URL}/meal-plans`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByText("I Miei Piani").first().waitFor({ timeout: 60000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("1) salvataggio normale: POST senza replace, si torna a 'I Miei Piani' con la scheda del piano", async () => {
    await generatePlan();
    await page.getByText("Salva questo piano").first().tap();

    // onSaved(): l'anteprima viene svuotata e l'app torna alla tab
    // "I Miei Piani" mostrando la scheda del piano salvato.
    await page.getByText("Salva questo piano").first().waitFor({ state: "detached", timeout: 15000 });
    await page.getByText("Piano Settimanale E2E").first().waitFor({ timeout: 15000 });
    assert.equal(postBodies.length, 1, "una sola POST di salvataggio");
    assert.ok(!postBodies[0].replace, "il primo salvataggio NON deve inviare replace:true");
    assert.equal(postBodies[0].items.length, STREAM_ITEMS.length);
    assert.ok(serverPlan, "il piano deve risultare salvato lato server");
    assert.equal(serverPlan!.id, "plan-1");
  });

  test("2+3) piano esistente + Annulla: compare il confirm, nessuna POST replace, piano intatto, bottone di nuovo cliccabile", async () => {
    await generatePlan();

    let dialogMessage: string | null = null;
    page.once("dialog", async (d) => {
      dialogMessage = d.message();
      await d.dismiss(); // = "Annulla"
    });
    await page.getByText("Salva questo piano").first().tap();

    // Il 409 + confirm sono sincroni al click: attendi che il dialogo sia stato gestito.
    await page.waitForFunction(() => true); // yield al loop eventi
    for (let i = 0; i < 50 && dialogMessage === null; i++) await page.waitForTimeout(100);

    assert.equal(dialogMessage, CONFIRM_TEXT, "deve comparire la domanda di sostituzione");
    assert.equal(postBodies.length, 2, "solo la POST che ha ricevuto 409, nessuna replica");
    assert.ok(!postBodies[1].replace, "la POST rifiutata non aveva replace");
    assert.ok(!postBodies.some((b) => b.replace === true), "con Annulla NESSUNA POST replace:true");
    assert.equal(serverPlan!.id, "plan-1", "il piano esistente resta invariato");

    // finish(): il bottone deve tornare cliccabile (testo visibile, non spinner)
    // e l'app resta sulla tab di generazione con l'anteprima ancora presente.
    await page.getByText("Salva questo piano").first().waitFor({ timeout: 10000 });
    await page.getByText("Pasta al pomodoro E2E").first().waitFor({ timeout: 5000 });
  });

  test("4) Sostituisci: POST replace:true, piano sostituito (nuovo id), si torna a 'I Miei Piani'", async () => {
    page.once("dialog", async (d) => {
      assert.equal(d.message(), CONFIRM_TEXT);
      await d.accept(); // = "Sostituisci"
    });
    await page.getByText("Salva questo piano").first().tap();

    // Attendi la POST replace:true (il titolo è già visibile nell'anteprima,
    // quindi non basta aspettare il testo) e poi il ritorno a "I Miei Piani".
    for (let i = 0; i < 100 && !postBodies.some((b) => b.replace === true); i++) {
      await page.waitForTimeout(100);
    }
    // onSaved(): l'anteprima viene svuotata e si torna alla tab "I Miei Piani".
    await page.getByText("Salva questo piano").first().waitFor({ state: "detached", timeout: 15000 });
    const replacePosts = postBodies.filter((b) => b.replace === true);
    assert.equal(replacePosts.length, 1, "esattamente UNA POST con replace:true dopo la conferma");
    assert.equal(serverPlan!.id, "plan-2", "il piano deve essere stato sostituito (nuovo id)");
    assert.equal(serverPlan!.title, "Piano Settimanale E2E");
    assert.equal(serverPlan!.items.length, STREAM_ITEMS.length);
  });

  test("5) fallimento definitivo dei vincoli: messaggio contestuale, nessun popup e allergie conservate", async () => {
    streamMode = "constraint-error";
    const unexpectedDialogs: string[] = [];
    const dialogListener = async (dialog: any) => {
      unexpectedDialogs.push(dialog.message());
      await dialog.dismiss();
    };
    page.on("dialog", dialogListener);

    try {
      await page.getByText("Genera con AI").first().tap();
      const allergiesInput = page.getByPlaceholder("Es. glutine, lattosio...");
      await allergiesInput.fill("Glutine");
      await page.getByText("Genera Piano").first().tap();

      const errorBox = page.getByTestId("mealplan-generation-error");
      await errorBox.waitFor({ timeout: 15000 });
      await page.getByText("Le preferenze sono rimaste compilate: riprova.", { exact: false }).waitFor();
      await page.waitForTimeout(500);
      const errorBounds = await errorBox.boundingBox();
      const viewportHeight = await page.evaluate(() => window.innerHeight);

      assert.equal(unexpectedDialogs.length, 0, "l'errore non deve aprire popup bloccanti");
      assert.equal(await allergiesInput.inputValue(), "Glutine", "il campo allergie deve restare compilato");
      assert.equal(await page.getByText("Penne di semola", { exact: false }).count(), 0, "nessun pasto incompatibile deve essere visibile");
      assert.ok(errorBounds, "il messaggio contestuale deve avere dimensioni visibili");
      assert.ok(
        errorBounds!.y >= 0 && errorBounds!.y + errorBounds!.height <= viewportHeight,
        "il messaggio contestuale deve scorrere automaticamente dentro il viewport mobile",
      );
    } finally {
      page.off("dialog", dialogListener);
      streamMode = "success";
    }
  });
});
