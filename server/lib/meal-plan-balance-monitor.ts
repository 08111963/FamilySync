import { generateWeeklyMealPlan, type MealPlanSuggestion } from './openai';
import { analyzeMediterraneanBalance, type MealPlanBalanceReport } from './meal-plan-balance';
import { logger } from './logger';
import { sendMealPlanBalanceAlertEmail } from './email';

/**
 * Monitoraggio periodico dell'equilibrio dei piani pasti mediterranei REALI.
 *
 * La logica di conteggio è testata offline, ma se il modello AI cambia
 * comportamento gli squilibri (troppi legumi, poca pasta, niente verdure)
 * tornerebbero senza che nessuno se ne accorga. Questo modulo genera
 * periodicamente UN piano mediterraneo vero con l'AI e lo valuta con
 * analyzeMediterraneanBalance, loggando un esito strutturato (tag
 * MEAL_PLAN_BALANCE) e avvisando il proprietario via email in caso di
 * squilibri.
 *
 * COSTO: ogni valutazione consuma quota AI reale (1 piano settimanale).
 * Per questo lo scheduler è OPT-IN via env MEAL_PLAN_BALANCE_MONITOR=true
 * e gira UNA volta a settimana (default: 1 run per valutazione).
 *
 * Esecuzione su richiesta: `npx tsx scripts/eval-meal-plan-balance.ts`
 * riusa runMealPlanBalanceEvalOnce e restituisce exit code 0/1.
 */

const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // una volta a settimana
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // 5 minuti dopo l'avvio

export function isBalanceMonitorEnabled(): boolean {
  return (process.env.MEAL_PLAN_BALANCE_MONITOR || '').trim().toLowerCase() === 'true';
}

export interface MealPlanBalanceRunResult {
  run: number;
  weekStartDate: string;
  itemCount: number;
  report: MealPlanBalanceReport;
}

export interface MealPlanBalanceEvalResult {
  weekStartDate: string;
  runs: MealPlanBalanceRunResult[];
  allBalanced: boolean;
}

/** Prossimo lunedì (i piani sono settimanali): data stabile e realistica. */
export function nextMondayIso(from = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay(); // 0=dom, 1=lun, ...
  const delta = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split('T')[0]!;
}

type PlanGenerator = typeof generateWeeklyMealPlan;

/**
 * Un singolo passaggio di valutazione: genera `runs` piani mediterranei REALI
 * (consuma quota AI) e li analizza. Ogni run produce un log strutturato con
 * tag MEAL_PLAN_BALANCE; gli squilibri vengono loggati come warn e (best
 * effort) notificati via email al proprietario.
 *
 * `generate` è iniettabile SOLO per i test offline.
 */
export async function runMealPlanBalanceEvalOnce(options?: {
  weekStartDate?: string;
  runs?: number;
  generate?: PlanGenerator;
}): Promise<MealPlanBalanceEvalResult> {
  const weekStartDate = options?.weekStartDate || nextMondayIso();
  const runs = Math.max(1, Math.min(5, options?.runs ?? 1));
  const generate = options?.generate ?? generateWeeklyMealPlan;

  const results: MealPlanBalanceRunResult[] = [];

  for (let run = 1; run <= runs; run++) {
    const plan: MealPlanSuggestion = await generate({
      familySize: 4,
      weekStartDate,
      preferences: { diet: 'Mediterranea', mealsPerDay: 3 },
    });

    const report = analyzeMediterraneanBalance(plan.items);
    results.push({ run, weekStartDate, itemCount: plan.items.length, report });

    const meta = {
      tag: 'MEAL_PLAN_BALANCE',
      run,
      runs,
      weekStartDate,
      itemCount: plan.items.length,
      daysAnalyzed: report.daysAnalyzed,
      lunchCount: report.lunchCount,
      dinnerCount: report.dinnerCount,
      pastaRiceLunches: report.pastaRiceLunches,
      legumeMeals: report.legumeMeals,
      fishMeals: report.fishMeals,
      missingVegetableSlots: report.missingVegetableSlots.length,
      balanced: report.balanced,
      issues: report.issues,
    };
    if (report.balanced) {
      logger.info('Meal plan balance eval: piano bilanciato', meta);
    } else {
      logger.warn('Meal plan balance eval: SQUILIBRI rilevati', meta);
    }
  }

  const allBalanced = results.every((r) => r.report.balanced);

  if (!allBalanced) {
    try {
      await sendMealPlanBalanceAlertEmail({
        weekStartDate,
        runs: results.map((r) => ({
          run: r.run,
          balanced: r.report.balanced,
          issues: r.report.issues,
        })),
      });
    } catch (err) {
      // L'alert email è best-effort: gli squilibri restano comunque nei log.
      logger.error('Meal plan balance alert email failed', {
        tag: 'MEAL_PLAN_BALANCE',
        error: String(err),
      });
    }
  }

  return { weekStartDate, runs: results, allBalanced };
}

/**
 * Avvia lo scheduler settimanale (solo se MEAL_PLAN_BALANCE_MONITOR=true).
 * Idempotente rispetto a più istanze: la valutazione è read-only (non tocca
 * il DB), il costo è solo la quota AI — per questo il flag è opt-in ed è
 * pensato per essere attivo su UNA sola installazione (es. produzione).
 */
export function startMealPlanBalanceScheduler(): void {
  if (!isBalanceMonitorEnabled()) {
    logger.info('Meal plan balance monitor disattivato (MEAL_PLAN_BALANCE_MONITOR!=true)', {
      tag: 'MEAL_PLAN_BALANCE',
    });
    return;
  }
  const run = () => {
    runMealPlanBalanceEvalOnce().catch((err) =>
      logger.error('Meal plan balance eval error', {
        tag: 'MEAL_PLAN_BALANCE',
        error: String(err),
      })
    );
  };
  setTimeout(run, FIRST_RUN_DELAY_MS);
  const timer = setInterval(run, CHECK_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}
