/**
 * Test del prewarm foto ricette (server/lib/recipe-image-prewarm.ts):
 * dopo weekly-meal-plan / weekly-meal-plan/stream / recipe-search i titoli
 * generati vengono passati al prewarm che:
 *  1. avvia la generazione per i titoli mancanti,
 *  2. salta i titoli già in cache su disco (zero quota),
 *  3. si ferma su outcome 'limited' / 'unavailable',
 *  4. continua sugli altri titoli se uno fallisce con errore AI.
 *
 * Esecuzione: npx tsx server/__tests__/recipe-image-prewarm.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {
  createRecipeImagePrewarm,
  recipeImageCacheKey,
  type StartGenerationParams,
} from "../lib/recipe-image-prewarm";

const IMAGES_DIR = path.resolve("uploads", "recipe-images");

/** Fake harness: registra le generazioni avviate e pilota gli esiti. */
function makeHarness(opts?: {
  cachedTitles?: string[];
  outcomes?: Record<string, string>; // titolo -> outcome (default 'ok')
  throwOn?: string[];                 // titoli che rigettano con errore AI
  concurrency?: number;
}) {
  const cachedFiles = new Set(
    (opts?.cachedTitles ?? []).map(
      t => path.join(IMAGES_DIR, `${recipeImageCacheKey(t)}.webp`),
    ),
  );
  const started: StartGenerationParams[] = [];
  const warnings: Array<{ message: string; meta: Record<string, unknown> }> = [];

  const prewarm = createRecipeImagePrewarm({
    imagesDir: IMAGES_DIR,
    fileExists: fp => cachedFiles.has(fp),
    startGeneration: params => {
      started.push(params);
      if (opts?.throwOn?.includes(params.title)) {
        return { run: Promise.reject(new Error(`AI down per ${params.title}`)) };
      }
      const outcome = opts?.outcomes?.[params.title] ?? "ok";
      return { run: Promise.resolve({ outcome }) };
    },
    logWarn: (message, meta) => warnings.push({ message, meta }),
    concurrency: opts?.concurrency ?? 1, // sequenziale: ordine deterministico
  });

  return { prewarm, started, warnings };
}

describe("prewarm foto ricette", () => {
  test("i titoli generati vengono passati al prewarm (con chiave e path cache)", async () => {
    const { prewarm, started } = makeHarness();
    await prewarm(
      [
        { title: "Lasagne alla bolognese", description: "Classiche" },
        { title: "  Risotto ai funghi  " },
      ],
      "user-1",
      "family-1",
    );
    assert.equal(started.length, 2);
    assert.deepEqual(started.map(s => s.title), ["Lasagne alla bolognese", "Risotto ai funghi"]);
    for (const s of started) {
      assert.equal(s.userId, "user-1");
      assert.equal(s.familyId, "family-1");
      assert.equal(s.key, recipeImageCacheKey(s.title));
      assert.equal(s.filePath, path.join(IMAGES_DIR, `${s.key}.webp`));
    }
    assert.equal(started[0].description, "Classiche");
  });

  test("titoli non validi (vuoti, troppo corti/lunghi, non stringa) vengono scartati", async () => {
    const { prewarm, started } = makeHarness();
    await prewarm(
      [
        { title: "" },
        { title: "a" },
        { title: "x".repeat(201) },
        { title: 42 as unknown as string },
        { title: "Pizza margherita" },
      ],
      "u",
      "f",
    );
    assert.deepEqual(started.map(s => s.title), ["Pizza margherita"]);
  });

  test("titoli già in cache su disco NON avviano generazioni (zero quota)", async () => {
    const { prewarm, started } = makeHarness({
      cachedTitles: ["Lasagne alla bolognese"],
    });
    await prewarm(
      [{ title: "Lasagne alla bolognese" }, { title: "Tiramisù" }],
      "u",
      "f",
    );
    // Solo il titolo mancante consuma uno slot di generazione.
    assert.deepEqual(started.map(s => s.title), ["Tiramisù"]);
  });

  test("cache-hit anche con maiuscole/accenti diversi (stessa chiave normalizzata)", async () => {
    assert.equal(
      recipeImageCacheKey("Tiramisù  classico"),
      recipeImageCacheKey("tiramisu CLASSICO"),
    );
    const { prewarm, started } = makeHarness({ cachedTitles: ["tiramisu CLASSICO"] });
    await prewarm([{ title: "Tiramisù  classico" }], "u", "f");
    assert.equal(started.length, 0);
  });

  test("tutti in cache: nessuna generazione avviata", async () => {
    const { prewarm, started } = makeHarness({ cachedTitles: ["A1", "B2"] });
    await prewarm([{ title: "A1" }, { title: "B2" }], "u", "f");
    assert.equal(started.length, 0);
  });

  test("si ferma su outcome 'limited' (quota famiglia esaurita)", async () => {
    const { prewarm, started } = makeHarness({
      outcomes: { Secondo: "limited" },
    });
    await prewarm(
      [{ title: "Primo" }, { title: "Secondo" }, { title: "Terzo" }, { title: "Quarto" }],
      "u",
      "f",
    );
    // Dopo 'limited' non insiste sugli altri titoli.
    assert.deepEqual(started.map(s => s.title), ["Primo", "Secondo"]);
  });

  test("si ferma su outcome 'unavailable' (tracking quota KO)", async () => {
    const { prewarm, started } = makeHarness({
      outcomes: { Primo: "unavailable" },
    });
    await prewarm([{ title: "Primo" }, { title: "Secondo" }], "u", "f");
    assert.deepEqual(started.map(s => s.title), ["Primo"]);
  });

  test("errore AI su un titolo: logga e continua con i successivi", async () => {
    const { prewarm, started, warnings } = makeHarness({ throwOn: ["Secondo"] });
    await prewarm(
      [{ title: "Primo" }, { title: "Secondo" }, { title: "Terzo" }],
      "u",
      "f",
    );
    assert.deepEqual(started.map(s => s.title), ["Primo", "Secondo", "Terzo"]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].meta.title, "Secondo");
  });

  test("la promise ritornata non rigetta mai (fire-and-forget sicuro)", async () => {
    const { prewarm } = makeHarness({ throwOn: ["Unico"] });
    await assert.doesNotReject(prewarm([{ title: "Unico" }], "u", "f"));
  });

  test("concorrenza 2: 'limited' ferma comunque i titoli rimanenti", async () => {
    const { prewarm, started } = makeHarness({
      outcomes: { A1: "limited", B2: "limited" },
      concurrency: 2,
    });
    await prewarm(
      [{ title: "A1" }, { title: "B2" }, { title: "C3" }, { title: "D4" }, { title: "E5" }],
      "u",
      "f",
    );
    // I due worker prendono al massimo i primi due titoli, poi si fermano.
    assert.ok(started.length <= 2, `attese <=2 generazioni, avviate ${started.length}`);
    assert.ok(!started.some(s => s.title === "E5"));
  });
});
