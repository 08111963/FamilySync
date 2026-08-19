// @ts-nocheck
/**
 * capture-real-screenshots.mjs
 *
 * Cattura screenshot REALI dell'app Expo web in esecuzione (NON HTML fittizio,
 * NON UI disegnata a mano). Usa Playwright per pilotare un browser Chromium,
 * effettua il login sull'account demo "Famiglia Bianchi" e naviga sulle rotte
 * reali dell'app cliccando testID/testi reali prima di ogni cattura.
 *
 * Requisiti d'ambiente:
 *   - DEMO_ACCOUNT_EMAIL    (opzionale, default "demo@familysync.eu")
 *   - DEMO_ACCOUNT_PASSWORD (OBBLIGATORIO)
 *   - SCREENSHOT_BASE_URL   (opzionale, default "http://127.0.0.1:5000")
 *
 * L'app web e il backend sono serviti dalla stessa origine (porta 5000):
 * getApiUrl() usa window.location.origin, quindi seminare il localStorage
 * @family_sync_auth sull'origine base autentica l'app.
 *
 * NB: richiede che la famiglia demo "Bianchi" sia già stata seminata
 * (scripts/seed-store-screenshot-account.ts). Fallisce in modo esplicito se il
 * contenuto atteso non è presente.
 *
 * Non stampa MAI token né password.
 */

import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const BASE_URL = (process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const EMAIL = process.env.DEMO_ACCOUNT_EMAIL || "demo@familysync.eu";
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;

if (!PASSWORD) {
  throw new Error(
    "DEMO_ACCOUNT_PASSWORD non impostata. Configura la password dell'account demo (non verrà mai stampata).",
  );
}

const STORAGE_KEY = "@family_sync_auth";

// Chromium fornito dall'ambiente Replit/Playwright (nessun download runtime).
const CHROMIUM_EXECUTABLE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

// Cartelle di output per le catture grezze.
const OUT_GOOGLE = path.resolve("assets/store/captures/google");
const OUT_APPLE = path.resolve("assets/store/captures/apple");

// Due configurazioni: viewport logico * deviceScaleFactor = pixel PNG esatti.
const DEVICES = [
  {
    name: "google",
    outDir: OUT_GOOGLE,
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    expected: { width: 1080, height: 1920 },
  },
  {
    name: "apple",
    outDir: OUT_APPLE,
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    expected: { width: 1290, height: 2796 },
  },
];

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Legge le dimensioni reali di un PNG dagli header (chunk IHDR). */
function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height };
}

/**
 * CSS iniettato PRIMA del rendering per rendere le catture deterministiche:
 * disabilita animazioni/transizioni. NON nasconde alcuna UI reale dell'app.
 */
const DETERMINISTIC_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
`;

/**
 * Nasconde SOLO i banner di sviluppo (stale/nuova versione) se presenti,
 * identificati dai loro testID reali. Non tocca nessun'altra UI dell'app.
 */
async function hideDevBanners(page) {
  await page
    .evaluate(() => {
      // web-stale-banner è già il wrapper: nascondere antenati rischierebbe di
      // occultare l'intera app. Per il banner update usiamo invece il suo vero
      // pulsante di chiusura.
      const staleBanner = document.querySelector('[data-testid="web-stale-banner"]');
      if (staleBanner) staleBanner.style.setProperty("display", "none", "important");
      const updateDismiss = document.querySelector('[data-testid="web-update-dismiss"]');
      if (updateDismiss instanceof HTMLElement) updateDismiss.click();
    })
    .catch(() => {});
}

/**
 * Aspetta che un testo compaia nel body (contenuto atteso della schermata).
 * Fallisce in modo esplicito se non appare entro il timeout.
 */
async function waitForText(page, text, label, timeout = 25000) {
  try {
    await page.waitForFunction(
      (t) => document.body && document.body.innerText.includes(t),
      text,
      { timeout, polling: 400 },
    );
  } catch {
    const snippet = await page
      .evaluate(() => (document.body ? document.body.innerText.slice(0, 400) : "<no body>"))
      .catch(() => "<unreadable>");
    throw new Error(
      `[${label}] Contenuto atteso "${text}" non trovato entro ${timeout}ms. Inizio pagina:\n${snippet}`,
    );
  }
}

/**
 * Naviga con la History API dentro la SPA già autenticata. Un page.goto per
 * ogni schermata rimonta tutta l'app, ricarica tutte le query condivise e può
 * saturare il rate limiter prima della cattura.
 */
async function goto(page, route, label) {
  const target = route.startsWith("/") ? route : `/${route}`;
  await page.evaluate((nextRoute) => {
    window.history.pushState({}, "", nextRoute);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, target).catch((e) => {
    throw new Error(`[${label}] Navigazione SPA fallita verso ${target}: ${e.message}`);
  });
  await delay(900);
}

/**
 * Cattura lo screenshot e verifica che il PNG abbia ESATTAMENTE le dimensioni
 * attese per il dispositivo. Fallisce altrimenti.
 */
async function capture(page, device, name) {
  await hideDevBanners(page);
  // Piccola pausa per il layout finale (font/immagini) prima dello scatto.
  await delay(500);
  const outPath = path.join(device.outDir, `${name}.png`);
  await page.screenshot({ path: outPath, fullPage: false });

  const { width, height } = readPngSize(outPath);
  if (width !== device.expected.width || height !== device.expected.height) {
    throw new Error(
      `[${device.name}/${name}] Dimensioni PNG errate: ${width}x${height}, attese ${device.expected.width}x${device.expected.height}`,
    );
  }
  console.log(`  [${device.name}] ${name} -> ${outPath} (${width}x${height})`);
}

// ---------------------------------------------------------------------------
// Login via API (non stampa mai token/password)
// ---------------------------------------------------------------------------
async function loginAndBuildAuth() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).catch((e) => {
    throw new Error(`Login: errore di rete verso ${BASE_URL}/api/auth/login: ${e.message}`);
  });

  if (!res.ok) {
    let msg = "";
    try {
      const body = await res.json();
      msg = body?.error?.message || "";
    } catch {}
    throw new Error(`Login fallito (status ${res.status})${msg ? `: ${msg}` : ""}`);
  }

  const data = await res.json();
  const { user, accessToken, refreshToken } = data || {};
  if (!user || !accessToken || !refreshToken) {
    throw new Error(
      "Login: risposta priva di user/accessToken/refreshToken (forma inattesa dell'API).",
    );
  }

  // Forma completa attesa da AuthContext (StoredAuth): { user, accessToken, refreshToken }.
  return { user, accessToken, refreshToken };
}

async function loadSeedIds(auth) {
  const familiesRes = await fetch(`${BASE_URL}/api/families`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!familiesRes.ok) {
    throw new Error(`Dati seed: /api/families ha restituito ${familiesRes.status}`);
  }
  const familyRows = await familiesRes.json();
  const family = Array.isArray(familyRows)
    ? familyRows.find((row) => row?.name === "Famiglia Bianchi")
    : null;
  if (!family?.id) {
    throw new Error('Dati seed: famiglia "Famiglia Bianchi" non trovata.');
  }

  const listsRes = await fetch(`${BASE_URL}/api/shopping/${family.id}/lists`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!listsRes.ok) {
    throw new Error(`Dati seed: elenco spesa ha restituito ${listsRes.status}`);
  }
  const lists = await listsRes.json();
  const shoppingList = Array.isArray(lists)
    ? lists.find((row) => row?.name === "Spesa della settimana")
    : null;
  if (!shoppingList?.id) {
    throw new Error('Dati seed: lista "Spesa della settimana" non trovata.');
  }

  return { familyId: family.id, shoppingListId: shoppingList.id };
}

// ---------------------------------------------------------------------------
// Sequenza di catture (rotte reali + click/testID reali)
// ---------------------------------------------------------------------------
async function captureAllForDevice(browser, device, auth, seedIds) {
  console.log(`\n=== Catture per "${device.name}" (${device.expected.width}x${device.expected.height}) ===`);
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    // Impedisce animazioni CSS di sistema quando disponibile.
    reducedMotion: "reduce",
  });
  // L'analytics di sviluppo non fa parte dell'esperienza utente e ogni evento
  // consumerebbe il rate limit API durante la sessione automatizzata.
  await context.route("**/api/test-analytics/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );

  // CSS deterministico su ogni pagina/navigazione.
  await context.addInitScript((css) => {
    const inject = () => {
      const style = document.createElement("style");
      style.setAttribute("data-screenshot-deterministic", "1");
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.head) inject();
    else document.addEventListener("DOMContentLoaded", inject, { once: true });
  }, DETERMINISTIC_CSS);

  const page = await context.newPage();

  try {
    // 1) Apri l'origine base per poter scrivere nel localStorage della stessa
    //    origine usata da getApiUrl() (window.location.origin).
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: JSON.stringify(auth) },
    );

    // 2) Ricarica per far leggere l'auth ad AuthContext.
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 45000 });
    await delay(1500);

    // --- HOME -------------------------------------------------------------
    await goto(page, "/", "home");
    await waitForText(page, "Famiglia Bianchi", "home");
    await capture(page, device, "home");

    // --- CALENDAR (evento di oggi seminato) -------------------------------
    await goto(page, "/calendar", "calendar");
    await waitForText(page, "Calendario", "calendar");
    // Evento seminato per oggi (at(0)).
    await waitForText(page, "Riunione a scuola di Emma", "calendar (evento di oggi)");
    await capture(page, device, "calendar");

    // --- SHOPPING DETAIL ---------------------------------------------------
    // È la rotta reale usata dalla Card dell'app. L'id arriva dalla stessa API
    // caricata dalla UI, così la cattura non dipende dalla struttura DOM web.
    await goto(
      page,
      `/shopping-list?id=${encodeURIComponent(seedIds.shoppingListId)}`,
      "shopping detail",
    );
    // Contenuto atteso nel dettaglio della lista.
    await waitForText(page, "Latte parzialmente scremato", "shopping detail");
    await capture(page, device, "shopping");

    // --- CHORES -----------------------------------------------------------
    await goto(page, "/chores", "chores");
    await waitForText(page, "Faccende", "chores");
    await capture(page, device, "chores");

    // --- REWARDS ----------------------------------------------------------
    await goto(page, "/rewards", "rewards");
    await waitForText(page, "Premi", "rewards");
    await capture(page, device, "rewards");

    // --- MEAL PLAN VIEW (apri il piano seminato via button-view-plan-*) ---
    await goto(page, "/meal-plans", "meal-plans");
    await waitForText(page, "Menu della settimana", "meal-plans (elenco)");
    // Clicca il pulsante reale button-view-plan-<id> del piano seminato.
    const openedPlan = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("[data-testid^='button-view-plan-']"));
      if (nodes.length > 0) {
        nodes[0].click();
        return true;
      }
      return false;
    });
    if (!openedPlan) {
      throw new Error(
        "[meal-plan view] Nessun button-view-plan-* trovato: il piano seminato non è presente.",
      );
    }
    await delay(2500);
    await waitForText(page, "Menu della settimana", "meal-plan view");
    await capture(page, device, "meal-plan");

    // --- PANTRY -----------------------------------------------------------
    await goto(page, "/pantry", "pantry");
    await waitForText(page, "Dispensa", "pantry");
    await capture(page, device, "pantry");

    // --- RECIPES ----------------------------------------------------------
    await goto(page, "/recipes", "recipes");
    await waitForText(page, "Le Mie Ricette", "recipes");
    await capture(page, device, "recipes");

    // --- BUDGET -----------------------------------------------------------
    await goto(page, "/budget", "budget");
    await waitForText(page, "Budget familiare", "budget");
    await capture(page, device, "budget");

    // --- BILLS ------------------------------------------------------------
    await goto(page, "/bills", "bills");
    await waitForText(page, "Bollette", "bills");
    await capture(page, device, "bills");

    // --- CHAT (dati Bianchi) ---------------------------------------------
    await goto(page, "/chat", "chat");
    await waitForText(page, "Famiglia Bianchi", "chat (header con nome famiglia)");
    await capture(page, device, "chat");

    // --- FAMILY (dati Bianchi) -------------------------------------------
    await goto(page, "/family", "family");
    await waitForText(page, "Famiglia Bianchi", "family");
    await capture(page, device, "family");
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Una nuova sessione non deve mai riusare catture rimaste da un tentativo
  // interrotto: in caso di errore il set resta incompleto e il generatore
  // fallisce esplicitamente, invece di mescolare schermate vecchie e nuove.
  await Promise.all([
    rm(OUT_GOOGLE, { recursive: true, force: true }),
    rm(OUT_APPLE, { recursive: true, force: true }),
  ]);
  await mkdir(OUT_GOOGLE, { recursive: true });
  await mkdir(OUT_APPLE, { recursive: true });

  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Account demo: ${EMAIL}`); // email non è un segreto; password mai stampata.

  const auth = await loginAndBuildAuth();
  console.log(`Login riuscito per: ${auth.user?.name || "(utente)"}`);
  const seedIds = await loadSeedIds(auth);

  const launchOpts = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  if (CHROMIUM_EXECUTABLE) {
    if (!existsSync(CHROMIUM_EXECUTABLE)) {
      throw new Error(
        `Chromium non trovato al percorso REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE: ${CHROMIUM_EXECUTABLE}`,
      );
    }
    launchOpts.executablePath = CHROMIUM_EXECUTABLE;
  }

  const browser = await chromium.launch(launchOpts);
  try {
    for (let index = 0; index < DEVICES.length; index++) {
      const device = DEVICES[index];
      if (index > 0) {
        console.log("\nPausa di sicurezza per la finestra del rate limiter...");
        await delay(65000);
      }
      await captureAllForDevice(browser, device, auth, seedIds);
    }
    console.log("\nTutte le catture completate con successo.");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  // Non stampiamo mai token/password: e.message contiene solo messaggi safe.
  console.error("ERRORE:", e.message);
  process.exit(1);
});
