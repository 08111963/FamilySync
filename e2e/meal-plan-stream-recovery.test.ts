/**
 * Test UI (Playwright, viewport mobile) del recupero del Piano Pasti quando
 * la risposta NDJSON si interrompe prima dell'evento "done".
 *
 * Verifica su una sessione browser autenticata che:
 *  1. uno stream che consegna alcuni pasti ma termina prima di "done" mostri
 *     il messaggio di recupero e NON mostri i pasti parziali;
 *  2. "Chiudi" elimini l'avviso senza lasciare un'anteprima incompleta;
 *  3. "Riprova" sia disponibile solo quando la richiesta precedente è terminata
 *     e avvii una nuova richiesta, che in questo test viene completata.
 *
 * Tutte le /api/** sono stubbate con stato in-memory: nessuna chiamata AI o
 * salvataggio reale.
 *
 * Esecuzione: npx tsx --test e2e/meal-plan-stream-recovery.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5000";
const AUTH_KEY = "@family_sync_auth";
const ACTIVE_FAMILY_KEY = "@family_sync_active_family";

const FAMILY_ID = "11111111-1111-4111-8111-111111111111";
const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "e2e-mealplan-recovery@test.local",
  name: "Tester recupero E2E",
  emailVerified: true,
};
const STREAM_PATH = `/api/ai/${FAMILY_ID}/weekly-meal-plan/stream`;
const PARTIAL_MEAL_TITLE = "Pasto parziale da non mostrare";
const COMPLETE_MEAL_TITLE = "Pasto recuperato E2E";

type StreamRequest = {
  attempt: number;
  requestId: string;
  ended: boolean;
  includedDone: boolean;
  retryStartedBeforePreviousEnded: boolean;
};

const streamRequests: StreamRequest[] = [];

let browser: Browser;
let context: BrowserContext;
let page: Page;

async function stubApi(pg: Page) {
  // La web-build locale può essere stata esportata senza EXPO_PUBLIC_DOMAIN:
  // riscriviamo il throw inlinato di getApiUrl() verso il backend di test.
  await pg.route("**/_expo/static/js/**", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(
      '{throw new Error("EXPO_PUBLIC_DOMAIN is not set")}',
      `{return ${JSON.stringify(BASE_URL + "/")}}`,
    );
    await route.fulfill({ response, body });
  });

  // Il controllo globale della versione può far apparire un banner sopra il
  // pulsante di generazione mentre il test sta esercitando lo stream. Un 503
  // è il comportamento di rete transitorio già gestito dal componente: ritenta
  // dopo 10 secondi, oltre la durata di questa verifica hermetica.
  await pg.route("**/build-version", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );

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
        name: "Famiglia recupero E2E",
        myRole: "admin",
        myMemberId: "33333333-3333-4333-8333-333333333333",
        subscriptionStatus: "free",
      }]);
    }
    if (path === "/api/moderation/preferences") return json({ aiFeaturesEnabled: true });
    if (path === `/api/meal-plans/${FAMILY_ID}/meal-plans` && method === "GET") return json([]);

    if (path === STREAM_PATH && method === "POST") {
      const body = request.postDataJSON() as {
        requestId?: string;
        preferences?: { dietProfile?: string };
      };
      const previous = streamRequests.at(-1);
      const record: StreamRequest = {
        attempt: streamRequests.length + 1,
        requestId: body.requestId || "missing-request-id",
        ended: false,
        includedDone: false,
        retryStartedBeforePreviousEnded: Boolean(previous && !previous.ended),
      };
      streamRequests.push(record);

      const requestId = record.requestId;
      const dietProfile = body.preferences?.dietProfile || "mediterranean";
      if (record.attempt <= 2) {
        // EOF dopo "items", senza "done": simula una connessione streaming
        // interrotta. L'app deve tenere i pasti solo nel buffer locale e non
        // renderizzarli come anteprima parziale.
        const partialLine = JSON.stringify({
          type: "items",
          requestId,
          dietProfile,
          items: [{
            date: "2030-03-04",
            mealType: "lunch",
            title: PARTIAL_MEAL_TITLE,
            description: "Non deve apparire prima della conclusione.",
            ingredients: [{ name: "Ingrediente parziale", quantity: "1", unit: "pezzo" }],
            steps: ["Passaggio parziale."],
          }],
        });
        await route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${partialLine}\n`,
        });
        record.ended = true;
        return;
      }

      record.includedDone = true;
      const completeLine = JSON.stringify({
        type: "done",
        requestId,
        dietProfile,
        title: "Piano recuperato E2E",
        weekStartDate: "2030-03-04",
        items: [{
          date: "2030-03-04",
          mealType: "lunch",
          title: COMPLETE_MEAL_TITLE,
          description: "Pasto arrivato dopo un retry completato.",
          ingredients: [{ name: "Riso", quantity: "80", unit: "g" }],
          steps: ["Prepara.", "Cuoci.", "Servi."],
        }],
      });
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: `${completeLine}\n`,
      });
      record.ended = true;
      return;
    }

    // Isola anche gli endpoint secondari: il test non deve dipendere dal DB.
    return json(method === "GET" ? [] : {});
  });
}

async function dismissWebUpdateBanner(pg: Page) {
  for (const testId of ["web-stale-dismiss", "web-update-dismiss"]) {
    const dismiss = pg.getByTestId(testId);
    if (await dismiss.count()) await dismiss.tap();
  }
}

async function waitForStreamAttempt(attempt: number) {
  // Il contatore vive nel processo del test, non nel bundle: il polling
  // evita di introdurre stato di test nell'app e mantiene l'asserzione leggibile.
  for (let i = 0; i < 150 && streamRequests.length < attempt; i++) {
    await page.waitForTimeout(100);
  }
  assert.ok(streamRequests.length >= attempt, `deve partire lo stream ${attempt}`);
}

describe("Recupero Piano Pasti dopo interruzione dello stream", () => {
  before(async () => {
    const response = await fetch(BASE_URL).catch(() => null);
    if (!response?.ok) {
      throw new Error(`Backend non raggiungibile su ${BASE_URL}: avviare il workflow "Start Backend"`);
    }

    // Evita un falso verde se il backend sta servendo una web-build precedente
    // priva della UI di recupero verificata da questo test.
    const html = await response.text();
    const bundleMatch = html.match(/_expo\/static\/js\/web\/[^"']+\.js/);
    assert.ok(bundleMatch, "bundle Expo non trovato nella pagina servita");
    const bundle = await fetch(`${BASE_URL}/${bundleMatch[0]}`).then((res) => res.text());
    assert.ok(
      bundle.includes("mealplan-generation-retry") &&
        bundle.includes("Nessun pasto parziale"),
      "La web-build servita non contiene il recupero dello stream: rigenerare la web-build (anteprima vecchia)",
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
            accessToken: "e2e-recovery-access-token",
            refreshToken: "e2e-recovery-refresh-token",
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
    await page.getByText("Genera Piano").first().waitFor({ timeout: 15_000 });
  });

  after(async () => {
    await context?.close();
    await browser?.close();
  });

  test("mostra il recupero, non mostra pasti parziali e consente Chiudi/Riprova in ordine", async () => {
    await page.getByText("Genera Piano").first().tap();

    const firstError = page.getByTestId("mealplan-generation-error");
    await firstError.waitFor({ state: "visible", timeout: 15_000 });
    await waitForStreamAttempt(1);
    assert.equal(streamRequests[0]!.includedDone, false, "il primo stream deve terminare prima di done");
    assert.equal(streamRequests[0]!.ended, true, "la richiesta interrotta deve essere terminata prima del retry");
    assert.match(
      await firstError.innerText(),
      /La connessione si è interrotta prima della conclusione\./,
      "l'utente deve ricevere il messaggio di recupero",
    );
    assert.match(
      await firstError.innerText(),
      /Nessun pasto parziale è stato mostrato/,
      "il messaggio deve chiarire che non sono stati mostrati pasti parziali",
    );
    assert.equal(
      await page.getByText(PARTIAL_MEAL_TITLE, { exact: true }).count(),
      0,
      "un pasto ricevuto prima dell'interruzione non deve comparire nell'anteprima",
    );
    assert.equal(await page.getByTestId("mealplan-generation-close").count(), 1, "deve esserci il controllo Chiudi");
    assert.equal(await page.getByTestId("mealplan-generation-retry").count(), 1, "deve esserci il controllo Riprova");

    await page.getByTestId("mealplan-generation-close").tap();
    await firstError.waitFor({ state: "detached", timeout: 5_000 });
    assert.equal(
      await page.getByText(PARTIAL_MEAL_TITLE, { exact: true }).count(),
      0,
      "Chiudi non deve lasciare un'anteprima parziale",
    );

    // Genera una seconda volta per ottenere un nuovo errore e poi esercitare
    // proprio il pulsante Riprova, non soltanto il pulsante principale.
    await page.getByText("Genera Piano").first().tap();
    const secondError = page.getByTestId("mealplan-generation-error");
    await secondError.waitFor({ state: "visible", timeout: 15_000 });
    await waitForStreamAttempt(2);
    assert.equal(streamRequests[1]!.ended, true, "anche il secondo stream deve essere terminato");
    assert.equal(
      streamRequests[1]!.retryStartedBeforePreviousEnded,
      false,
      "la seconda generazione non deve partire prima della chiusura della prima richiesta",
    );
    assert.equal(
      await page.getByText(PARTIAL_MEAL_TITLE, { exact: true }).count(),
      0,
      "il secondo errore non deve mostrare pasti parziali",
    );

    const retry = page.getByTestId("mealplan-generation-retry");
    assert.equal(await retry.isEnabled(), true, "Riprova deve essere utilizzabile dopo la fine dello stream");
    await retry.tap();
    await waitForStreamAttempt(3);
    assert.equal(
      streamRequests[2]!.retryStartedBeforePreviousEnded,
      false,
      "Riprova deve partire solo dopo l'annullamento della richiesta precedente",
    );
    assert.equal(streamRequests[2]!.includedDone, true, "il retry deve ricevere uno stream completo");
    await page.getByText(COMPLETE_MEAL_TITLE, { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(
      await page.getByText(PARTIAL_MEAL_TITLE, { exact: true }).count(),
      0,
      "il piano completato non deve reintrodurre il pasto parziale",
    );
  });
});