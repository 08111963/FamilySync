---
name: Meal plan balance monitor
description: Periodic real-AI evaluation of Mediterranean meal plan balance
---

Rule: the weekly real-AI balance eval (tag MEAL_PLAN_BALANCE) is OPT-IN via env `MEAL_PLAN_BALANCE_MONITOR=true` because every run consumes real AI quota; keep it enabled on at most ONE installation (production). On imbalance it emails APP_OWNER_EMAILS (best-effort) and logs structured warn.

**Why:** offline keyword tests can't catch AI model drift; but an always-on scheduler in every dev instance would silently burn quota.

Autoscale caveat: confirmed working in prod (first run fires ~5 min after cold boot IF traffic keeps the instance alive that long), but the weekly `setInterval` will practically never fire on autoscale — the instance won't stay up 7 days. A durable schedule needs DB-backed last-run tracking (same family of fix as the upload-integrity restart problem).

**How to apply:** on-demand run = `npx tsx scripts/eval-meal-plan-balance.ts [weekStart] [runs]` (exit 0/1); scheduler and shared eval live in `server/lib/meal-plan-balance-monitor.ts` — reuse `runMealPlanBalanceEvalOnce` (generator injectable for offline tests) instead of duplicating eval logic.
