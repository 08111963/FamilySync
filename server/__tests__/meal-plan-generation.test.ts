import { test } from "node:test";
import assert from "node:assert/strict";

// La chiave non serve per davvero: iniettiamo un client fittizio, ma
// assertAiConfigured richiede che una chiave sia presente nell'ambiente.
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";
import { generateWeeklyMealPlan, __setOpenAiClientForTest } from "../lib/openai";

const WEEK_START = "2026-08-03"; // lunedì
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + i);
  return d.toISOString().split("T")[0]!;
});

type Meal = { date: string; mealType: string; title: string; description: string; ingredients: unknown[]; steps: string[] };

function meal(date: string, mealType: string, title: string): Meal {
  return { date, mealType, title, description: "d", ingredients: [{ name: "x", quantity: "1", unit: "pz" }], steps: ["fai"] };
}

/** Estrae le date richieste dal system prompt di fetchChunk. */
function requestedDates(sysPrompt: string): string[] {
  const m = sysPrompt.match(/SOLO per questi giorni: ([0-9,\- ]+)\./);
  assert.ok(m, "system prompt deve indicare i giorni richiesti");
  return m![1]!.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Client OpenAI simulato: per ogni chiamata decide la risposta in base alle
 * date richieste nel prompt. `plan` mappa la data -> handler che restituisce
 * gli item (o lancia). `onDedupe` gestisce la chiamata di ripassata (quella
 * con più date o con hint "mai citati finora").
 */
function makeFakeClient(opts: {
  itemsForDate: (date: string, callIndex: number) => Meal[];
  failDates?: Set<string>;
  onDedupe?: (dates: string[], sysPrompt: string) => Meal[];
  dedupeFails?: boolean;
}) {
  const calls: { dates: string[]; sysPrompt: string }[] = [];
  const client = {
    chat: {
      completions: {
        create: async (req: { messages: Array<{ role: string; content: string }> }) => {
          const sysPrompt = req.messages.find((m) => m.role === "system")!.content;
          const dates = requestedDates(sysPrompt);
          const callIndex = calls.length;
          calls.push({ dates, sysPrompt });
          const isDedupe = sysPrompt.includes("mai citati finora");
          if (isDedupe) {
            if (opts.dedupeFails) throw new Error("dedupe boom");
            const items = opts.onDedupe ? opts.onDedupe(dates, sysPrompt) : [];
            return { choices: [{ message: { content: JSON.stringify({ items }) }, finish_reason: "stop" }] };
          }
          assert.equal(dates.length, 1, "le ondate chiedono un giorno per chiamata");
          const date = dates[0]!;
          if (opts.failDates?.has(date)) throw new Error(`boom ${date}`);
          const items = opts.itemsForDate(date, callIndex);
          return { choices: [{ message: { content: JSON.stringify({ items }) }, finish_reason: "stop" }] };
        },
      },
    },
  };
  return { client, calls };
}

const mealOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

function assertChronological(items: Array<{ date: string; mealType: string }>) {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    const cmp = a.date.localeCompare(b.date);
    assert.ok(
      cmp < 0 || (cmp === 0 && (mealOrder[a.mealType] ?? 99) <= (mealOrder[b.mealType] ?? 99)),
      `items non in ordine cronologico: ${a.date}/${a.mealType} prima di ${b.date}/${b.mealType}`
    );
  }
}

test("piano completo: 7 giorni, item in ordine cronologico, onProgress per giorno ordinato", async (t) => {
  const { client, calls } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      // Ordine volutamente mescolato: dinner prima di breakfast.
      return [
        meal(date, "dinner", `Cena ${idx}`),
        meal(date, "breakfast", `Colazione ${idx}`),
        meal(date, "lunch", `Pranzo ${idx}`),
      ];
    },
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const progress: Array<Array<{ date: string; mealType: string }>> = [];
  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    onProgress: (items) => progress.push(items.map((i) => ({ date: i.date, mealType: i.mealType }))),
  });

  assert.equal(calls.length, 7, "7 chiamate (una per giorno), nessuna ripassata senza doppioni");
  assert.equal(plan.items.length, 21);
  assertChronological(plan.items);
  assert.deepEqual(
    plan.items.map((i) => i.date),
    DATES.flatMap((d) => [d, d, d])
  );
  // Ogni batch di progresso riguarda un giorno ed è ordinato per pasto.
  assert.equal(progress.length, 7);
  for (const batch of progress) {
    assert.equal(new Set(batch.map((b) => b.date)).size, 1);
    assertChronological(batch);
  }
});

test("ondata parzialmente fallita: i giorni riusciti restano, nessun errore", async (t) => {
  const { client } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      return [meal(date, "lunch", `Pranzo ${idx}`), meal(date, "dinner", `Cena ${idx}`)];
    },
    failDates: new Set([DATES[1]!, DATES[4]!]),
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  // 5 giorni riusciti x 2 pasti; i giorni falliti mancano ma il piano non è vuoto.
  assert.equal(plan.items.length, 10);
  assert.ok(!plan.items.some((i) => i.date === DATES[1] || i.date === DATES[4]));
  assertChronological(plan.items);
});

test("tutte le ondate fallite: propaga un errore tipizzato invece di piano vuoto", async (t) => {
  const { client } = makeFakeClient({
    itemsForDate: () => [],
    failDates: new Set(DATES),
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  await assert.rejects(
    generateWeeklyMealPlan({ familySize: 4, weekStartDate: WEEK_START }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    }
  );
});

test("ripassata anti-doppioni: il doppione intra-ondata viene sostituito", async (t) => {
  // Giorno 0 e giorno 1 (stessa ondata) propongono lo stesso pranzo.
  const { client, calls } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      const lunchTitle = idx === 1 ? "Pasta al Pomodoro" : `Pranzo ${idx}`;
      return [meal(date, "lunch", idx === 0 ? "pasta al pomodoro!" : lunchTitle), meal(date, "dinner", `Cena ${idx}`)];
    },
    onDedupe: (dates) => {
      // La ripassata riceve SOLO i giorni con doppioni.
      assert.deepEqual(dates, [DATES[1]]);
      return [meal(DATES[1]!, "lunch", "Risotto agli asparagi"), meal(DATES[1]!, "dinner", "Cena ignorata")];
    },
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  assert.equal(calls.length, 8, "7 giorni + 1 sola chiamata di ripassata");
  const day1Lunch = plan.items.find((i) => i.date === DATES[1] && i.mealType === "lunch");
  assert.equal(day1Lunch?.title, "Risotto agli asparagi", "doppione sostituito");
  // La cena del giorno 1 NON era doppia e resta invariata.
  const day1Dinner = plan.items.find((i) => i.date === DATES[1] && i.mealType === "dinner");
  assert.equal(day1Dinner?.title, "Cena 1");
  assert.equal(plan.items.length, 14, "nessun buco né item extra");
  // Nessun titolo (normalizzato) doppio nel piano finale.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const titles = plan.items.map((i) => norm(i.title));
  assert.equal(new Set(titles).size, titles.length);
});

test("ripassata anti-doppioni: riconosce lo stesso piatto scritto in modo diverso (fuzzy)", async (t) => {
  // Caso reale: 3 pranzi consecutivi erano "pasta al tonno e pomodorini"
  // con titoli leggermente diversi (anche "Spaghetti" invece di "Pasta").
  const nearDupes = [
    "Pasta al tonno e pomodorini con insalata mista",
    "Spaghetti con tonno e pomodorini + insalata mista",
    "Pasta al tonno con pomodorini e insalata mista",
  ];
  const dedupeCalls: string[][] = [];
  const { client } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      const lunchTitle = idx < 3 ? nearDupes[idx]! : `Pranzo ${idx}`;
      return [meal(date, "lunch", lunchTitle), meal(date, "dinner", `Cena ${idx}`)];
    },
    onDedupe: (dates) => {
      dedupeCalls.push(dates);
      return dates.map((d, i) => meal(d, "lunch", `Piatto alternativo ${i}`));
    },
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  // I giorni 1 e 2 sono riconosciuti come doppioni del giorno 0 e sostituiti.
  assert.deepEqual(dedupeCalls, [[DATES[1], DATES[2]]]);
  const lunch1 = plan.items.find((i) => i.date === DATES[1] && i.mealType === "lunch");
  const lunch2 = plan.items.find((i) => i.date === DATES[2] && i.mealType === "lunch");
  assert.equal(lunch1?.title, "Piatto alternativo 0");
  assert.equal(lunch2?.title, "Piatto alternativo 1");
  // Il giorno 0 resta invariato e piatti legittimamente diversi non vengono toccati.
  const lunch0 = plan.items.find((i) => i.date === DATES[0] && i.mealType === "lunch");
  assert.equal(lunch0?.title, nearDupes[0]);
  assert.equal(plan.items.length, 14);
});

test("ripassata fuzzy: piatti diversi con un ingrediente in comune NON sono doppioni", async (t) => {
  const { client, calls } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      const lunches = [
        "Pasta al pomodoro e basilico",
        "Pasta alla Norma con melanzane",
        "Risotto ai frutti di mare",
        "Insalata di riso con verdure",
        "Zuppa di lenticchie con riso",
        "Petto di pollo alla piastra con patate",
        "Frittata di zucchine con insalata",
      ];
      return [meal(date, "lunch", lunches[idx]!), meal(date, "dinner", `Cena ${idx}`)];
    },
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  assert.equal(calls.length, 7, "nessuna ripassata: nessun falso positivo");
  assert.equal(plan.items.length, 14);
});

test("ripassata fallita: il doppione resta al suo posto (mai buchi nel piano)", async (t) => {
  const { client, calls } = makeFakeClient({
    itemsForDate: (date) => {
      const idx = DATES.indexOf(date);
      const lunchTitle = idx <= 1 ? "Minestrone" : `Pranzo ${idx}`;
      return [meal(date, "lunch", lunchTitle), meal(date, "dinner", `Cena ${idx}`)];
    },
    dedupeFails: true,
  });
  __setOpenAiClientForTest(client);
  t.after(() => __setOpenAiClientForTest(null));

  const plan = await generateWeeklyMealPlan({
    familySize: 4,
    weekStartDate: WEEK_START,
    preferences: { mealsPerDay: 2 },
  });

  assert.equal(calls.length, 8, "la ripassata viene comunque tentata una volta");
  assert.equal(plan.items.length, 14, "nessun pasto perso anche se la ripassata fallisce");
  const minestroni = plan.items.filter((i) => i.title === "Minestrone");
  assert.equal(minestroni.length, 2, "il doppione resta: meglio ripetuto che mancante");
});
