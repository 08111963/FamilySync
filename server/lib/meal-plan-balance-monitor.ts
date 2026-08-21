import { sql } from 'drizzle-orm';
import { db } from '../db';
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // intervallo tra due run (1 settimana)
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // controllo economico su DB ogni 6 ore
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // 5 minuti dopo l'avvio

/** Nome del job nella tabella scheduled_job_runs. */
export const BALANCE_JOB_NAME = 'meal_plan_balance_weekly';

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
    logger.info('AI provider selected', {
      event: 'ai_provider_selected',
      provider: 'replit_managed',
      operation: 'meal-plan-balance-monitor',
      userRole: 'background',
    });
    const plan: MealPlanSuggestion = await generate({
      familySize: 4,
      weekStartDate,
      preferences: { diet: 'Mediterranea', mealsPerDay: 3 },
      provider: 'replit_managed',
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
 * Prova ad aggiudicarsi (claim atomico) il run settimanale del job.
 *
 * Una sola istruzione SQL: INSERT se il job non è mai girato, altrimenti
 * UPDATE del last_run_at SOLO se è passata almeno una settimana. Il RETURNING
 * dice se questa istanza ha vinto il claim: con più istanze concorrenti solo
 * una riceve la riga (Postgres serializza sul conflitto di chiave primaria).
 *
 * Il claim NON viene mai rilasciato in caso di errore del run: un run fallito
 * può aver già consumato quota AI, quindi si riprova solo la settimana dopo
 * (garanzia: al massimo 1 valutazione a settimana).
 */
export async function claimWeeklyBalanceRun(now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - WEEK_MS);
  const result = await db.execute(sql`
    INSERT INTO scheduled_job_runs (job_name, last_run_at)
    VALUES (${BALANCE_JOB_NAME}, ${now})
    ON CONFLICT (job_name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
    WHERE scheduled_job_runs.last_run_at <= ${cutoff}
    RETURNING job_name
  `);
  return (result.rows?.length ?? 0) > 0;
}

/**
 * Avvia lo scheduler settimanale (solo se MEAL_PLAN_BALANCE_MONITOR=true).
 *
 * Su deployment autoscale l'istanza non resta viva 7 giorni, quindi il
 * "quando è partito l'ultimo run" è persistito su DB (scheduled_job_runs) e
 * verificato con un poll economico: 5 minuti dopo il boot e poi ogni 6 ore.
 * Il run vero parte solo se il claim atomico riesce (è passata una settimana
 * e nessun'altra istanza l'ha già preso), quindi è sicuro anche con più
 * istanze e riavvii frequenti.
 */
export function startMealPlanBalanceScheduler(): void {
  if (!isBalanceMonitorEnabled()) {
    logger.info('Meal plan balance monitor disattivato (MEAL_PLAN_BALANCE_MONITOR!=true)', {
      tag: 'MEAL_PLAN_BALANCE',
    });
    return;
  }
  const tick = async () => {
    try {
      const claimed = await claimWeeklyBalanceRun();
      if (!claimed) return; // settimana non ancora passata o run preso da un'altra istanza
      logger.info('Meal plan balance eval: claim settimanale acquisito, avvio run', {
        tag: 'MEAL_PLAN_BALANCE',
      });
      await runMealPlanBalanceEvalOnce();
    } catch (err) {
      logger.error('Meal plan balance eval error', {
        tag: 'MEAL_PLAN_BALANCE',
        error: String(err),
      });
    }
  };
  const first = setTimeout(() => void tick(), FIRST_RUN_DELAY_MS) as unknown as { unref?: () => void };
  first.unref?.();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}
