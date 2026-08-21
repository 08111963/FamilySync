import { test } from "node:test";
import assert from "node:assert/strict";

// La chiave non serve per davvero: iniettiamo un generatore fittizio (mai il
// client OpenAI reale), ma i moduli importati richiedono l'ambiente AI.
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "test-key";

import {
  runMealPlanBalanceEvalOnce,
  nextMondayIso,
  isBalanceMonitorEnabled,
} from "../lib/meal-plan-balance-monitor";
import type { MealPlanItem } from "../lib/meal-plan-balance";

const WEEK_START = "2026-08-03"; // lunedì
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + i);
  return d.toISOString().split("T")[0]!;
});

function meal(date: string, mealType: string, title: string): MealPlanItem {
  return {
    date,
    mealType: mealType as MealPlanItem["mealType"],
    title,
    description: "",
    ingredients: [],
    steps: ["fai"],
  };
}

/** Piano bilanciato: pasta+verdure a pranzo, pesce/carne+verdure a cena. */
function balancedPlan(): { items: MealPlanItem[] } {
  const items: MealPlanItem[] = [];
  for (const [i, date] of DATES.entries()) {
    items.push(meal(date, "lunch", "Pasta al pomodoro con contorno di verdure"));
    items.push(
      meal(date, "dinner", i < 2 ? "Salmone al forno con insalata" : "Pollo con verdure grigliate")
    );
  }
  return { items };
}

/** Piano squilibrato: legumi ovunque, niente pasta né pesce né verdure. */
function unbalancedPlan(): { items: MealPlanItem[] } {
  const items: MealPlanItem[] = [];
  for (const date of DATES) {
    items.push(meal(date, "lunch", "Zuppa di lenticchie"));
    items.push(meal(date, "dinner", "Burger di ceci"));
  }
  return { items };
}

test("eval con piano bilanciato: allBalanced true e report coerente", async () => {
  const result = await runMealPlanBalanceEvalOnce({
    weekStartDate: WEEK_START,
    runs: 1,
    generate: async () => balancedPlan() as never,
  });
  assert.equal(result.allBalanced, true);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0]!.report.balanced, true);
  assert.equal(result.runs[0]!.report.daysAnalyzed, 7);
});

test("eval con piano squilibrato: allBalanced false e issues presenti", async () => {
  const result = await runMealPlanBalanceEvalOnce({
    weekStartDate: WEEK_START,
    runs: 2,
    generate: async () => unbalancedPlan() as never,
  });
  assert.equal(result.allBalanced, false);
  assert.equal(result.runs.length, 2);
  for (const r of result.runs) {
    assert.equal(r.report.balanced, false);
    assert.ok(r.report.issues.length > 0);
  }
});

test("eval mista: basta una run squilibrata per allBalanced false", async () => {
  let call = 0;
  const result = await runMealPlanBalanceEvalOnce({
    weekStartDate: WEEK_START,
    runs: 2,
    generate: async () => (call++ === 0 ? balancedPlan() : unbalancedPlan()) as never,
  });
  assert.equal(result.allBalanced, false);
  assert.equal(result.runs[0]!.report.balanced, true);
  assert.equal(result.runs[1]!.report.balanced, false);
});

test("runs viene limitato tra 1 e 5", async () => {
  let calls = 0;
  const gen = async () => {
    calls++;
    return balancedPlan() as never;
  };
  await runMealPlanBalanceEvalOnce({ weekStartDate: WEEK_START, runs: 99, generate: gen });
  assert.equal(calls, 5);
  calls = 0;
  await runMealPlanBalanceEvalOnce({ weekStartDate: WEEK_START, runs: 0, generate: gen });
  assert.equal(calls, 1);
});

test("il job di bilanciamento fissa esplicitamente Replit Managed AI", async () => {
  let provider: string | undefined;
  await runMealPlanBalanceEvalOnce({
    weekStartDate: WEEK_START,
    generate: async (context) => {
      provider = context.provider;
      return balancedPlan() as never;
    },
  });
  assert.equal(provider, "replit_managed");
});

test("nextMondayIso restituisce sempre un lunedì futuro", () => {
  const iso = nextMondayIso(new Date("2026-08-02T10:00:00Z")); // domenica
  assert.equal(iso, "2026-08-03");
  const fromMonday = nextMondayIso(new Date("2026-08-03T10:00:00Z"));
  assert.equal(fromMonday, "2026-08-10"); // da lunedì -> lunedì successivo
  for (const day of ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"]) {
    const next = nextMondayIso(new Date(`${day}T10:00:00Z`));
    assert.equal(new Date(next).getUTCDay(), 1);
    assert.ok(next > day);
  }
});

test("isBalanceMonitorEnabled: solo con MEAL_PLAN_BALANCE_MONITOR=true", () => {
  const prev = process.env.MEAL_PLAN_BALANCE_MONITOR;
  try {
    delete process.env.MEAL_PLAN_BALANCE_MONITOR;
    assert.equal(isBalanceMonitorEnabled(), false);
    process.env.MEAL_PLAN_BALANCE_MONITOR = "false";
    assert.equal(isBalanceMonitorEnabled(), false);
    process.env.MEAL_PLAN_BALANCE_MONITOR = " TRUE ";
    assert.equal(isBalanceMonitorEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.MEAL_PLAN_BALANCE_MONITOR;
    else process.env.MEAL_PLAN_BALANCE_MONITOR = prev;
  }
});
