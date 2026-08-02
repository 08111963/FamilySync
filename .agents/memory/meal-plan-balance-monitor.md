---
name: Meal plan balance monitor
description: Periodic real-AI evaluation of Mediterranean meal plan balance
---

Rule: the weekly real-AI balance eval (tag MEAL_PLAN_BALANCE) is OPT-IN via env `MEAL_PLAN_BALANCE_MONITOR=true` because every run consumes real AI quota; keep it enabled on at most ONE installation (production). On imbalance it emails APP_OWNER_EMAILS (best-effort) and logs structured warn.

**Why:** offline keyword tests can't catch AI model drift; but an always-on scheduler in every dev instance would silently burn quota.

Autoscale: the weekly schedule is DURABLE — last-run persisted in `scheduled_job_runs` (migration 0020) with a single-statement atomic claim (INSERT ... ON CONFLICT DO UPDATE ... WHERE last_run_at older than 7 days, RETURNING). Scheduler just polls the claim cheaply (5 min after boot, then every 6h); a failed run does NOT release the claim (quota safety: max 1 eval/week). Reuse `scheduled_job_runs` + this claim pattern for any other periodic job that must survive autoscale restarts.

**How to apply:** on-demand run = `npx tsx scripts/eval-meal-plan-balance.ts [weekStart] [runs]` (exit 0/1); scheduler and shared eval live in `server/lib/meal-plan-balance-monitor.ts` — reuse `runMealPlanBalanceEvalOnce` (generator injectable for offline tests) instead of duplicating eval logic.
