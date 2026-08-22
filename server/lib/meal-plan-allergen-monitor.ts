import { AiError } from './ai-errors';
import {
  generateWeeklyMealPlan,
  type MealPlanConstraintAttemptReport,
} from './openai';
import { logger } from './logger';
import { sendMealPlanAllergenRegressionAlertEmail } from './email';
import { claimScheduledJobRun } from './scheduled-jobs';

/**
 * Sentinella periodica contro regressioni del modello sui vincoli allergeni.
 *
 * Genera esclusivamente un piano sintetico con il profilo chiuso
 * "mediterranea senza glutine". Non registra né passa al logging preferenze reali, titoli,
 * ingredienti o contenuti dei pasti: conserva solo l'esito, i tentativi e i
 * codici emessi da validateMealPlanConstraints, cioè lo stesso validatore che
 * protegge i piani utente.
 *
 * Il controllo è opt-in (MEAL_PLAN_ALLERGEN_MONITOR=true). Il claim durevole
 * settimanale viene mantenuto anche se il provider non è disponibile: così una
 * settimana non può mai consumare più del budget rigido indicato sotto.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

/** Un solo profilo chiuso noto: nessun dato sanitario reale o campo libero. */
export const ALLERGEN_MONITOR_DIET_PROFILE = 'mediterranean_gluten_free' as const;
export const ALLERGEN_MONITOR_EXPECTED_VIOLATION_CODE = 'gluten';
/** Massimo tentativi completi del generatore; non configurabile da env. */
export const ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS = 2;
/**
 * Il monitor usa lo stesso contratto settimanale dell'app: un tentativo
 * completo è una sola chiamata e può avere un solo repair globale.
 */
export const ALLERGEN_MONITOR_MAX_MODEL_CALLS = 2;
export const ALLERGEN_MONITOR_JOB_NAME = 'meal_plan_allergen_weekly';

export type MealPlanAllergenMonitorOutcome =
  | 'passed'
  | 'recovered'
  | 'regression_confirmed'
  | 'unavailable';

export interface MealPlanAllergenMonitorResult {
  outcome: MealPlanAllergenMonitorOutcome;
  attempts: number;
  violationCodes: string[];
}

type AllergenMonitorGenerator = typeof generateWeeklyMealPlan;
type RegressionNotifier = (report: {
  attempts: number;
  violationCodes: string[];
}) => Promise<void>;

export function isAllergenMonitorEnabled(): boolean {
  return (process.env.MEAL_PLAN_ALLERGEN_MONITOR || '').trim().toLowerCase() === 'true';
}

function uniqueViolationCodes(reports: MealPlanConstraintAttemptReport[]): string[] {
  return Array.from(new Set(reports.flatMap((report) => report.violationCodes))).sort();
}

/**
 * Esegue una sola sentinella. Una regressione è "confermata" solo se il
 * generatore ha esaurito tutti i tentativi e ha restituito il suo errore
 * terminale di vincolo; un primo tentativo poi corretto resta telemetria ma
 * non genera alert.
 */
export async function runMealPlanAllergenMonitorOnce(options?: {
  generate?: AllergenMonitorGenerator;
  notifyRegression?: RegressionNotifier;
}): Promise<MealPlanAllergenMonitorResult> {
  const generate = options?.generate ?? generateWeeklyMealPlan;
  const notifyRegression = options?.notifyRegression ?? sendMealPlanAllergenRegressionAlertEmail;
  const rejectedAttempts: MealPlanConstraintAttemptReport[] = [];

  try {
    await generate({
      familySize: 4,
      weekStartDate: nextMondayIso(),
      preferences: {
        dietProfile: ALLERGEN_MONITOR_DIET_PROFILE,
        mealsPerDay: 2,
      },
      maxConstraintAttempts: ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS,
      maxModelCalls: ALLERGEN_MONITOR_MAX_MODEL_CALLS,
      suppressInternalLogs: true,
      onConstraintViolation: (report) => {
        // La callback del generatore già riduce il payload ai soli codici.
        rejectedAttempts.push({
          attempt: report.attempt,
          violationCodes: [...report.violationCodes],
        });
      },
    });

    const violationCodes = uniqueViolationCodes(rejectedAttempts);
    const result: MealPlanAllergenMonitorResult = {
      outcome: rejectedAttempts.length === 0 ? 'passed' : 'recovered',
      attempts: rejectedAttempts.length + 1,
      violationCodes,
    };
    logger.info('Meal plan allergen monitor completed', {
      tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
      ...result,
    });
    return result;
  } catch (error) {
    const violationCodes = uniqueViolationCodes(rejectedAttempts);
    const isConfirmedRegression =
      error instanceof AiError &&
      error.code === 'AI_CONSTRAINT_VIOLATION' &&
      rejectedAttempts.length === ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS &&
      rejectedAttempts.every((report) =>
        report.violationCodes.includes(ALLERGEN_MONITOR_EXPECTED_VIOLATION_CODE));
    const result: MealPlanAllergenMonitorResult = {
      outcome: isConfirmedRegression ? 'regression_confirmed' : 'unavailable',
      attempts: isConfirmedRegression
        ? rejectedAttempts.length
        : Math.min(
          ALLERGEN_MONITOR_MAX_GENERATION_ATTEMPTS,
          rejectedAttempts.length + 1,
        ),
      violationCodes,
    };

    if (!isConfirmedRegression) {
      // Non includere messaggi del provider: nel registro restano solo i
      // campi strettamente necessari per il controllo sintetico.
      logger.info('Meal plan allergen monitor unavailable', {
        tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
        ...result,
      });
      return result;
    }

    logger.warn('Meal plan allergen regression confirmed', {
      tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
      ...result,
    });
    try {
      await notifyRegression({
        attempts: result.attempts,
        violationCodes: result.violationCodes,
      });
    } catch {
      // L'email è best-effort: l'esito strutturato nei log resta disponibile.
      logger.error('Meal plan allergen regression alert email failed', {
        tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
        ...result,
      });
    }
    return result;
  }
}

/** Prossimo lunedì: la finestra del piano resta stabile senza dati utente. */
function nextMondayIso(from = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay();
  const delta = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().split('T')[0]!;
}

/** Claim durevole: una sola istanza e al massimo un budget settimanale. */
export async function claimWeeklyAllergenMonitorRun(now = new Date()): Promise<boolean> {
  return claimScheduledJobRun(ALLERGEN_MONITOR_JOB_NAME, WEEK_MS, now);
}

export function startMealPlanAllergenMonitorScheduler(): void {
  if (!isAllergenMonitorEnabled()) {
    logger.info('Meal plan allergen monitor disattivato (MEAL_PLAN_ALLERGEN_MONITOR!=true)', {
      tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
    });
    return;
  }

  const tick = async () => {
    try {
      const claimed = await claimWeeklyAllergenMonitorRun();
      if (!claimed) return;
      await runMealPlanAllergenMonitorOnce();
    } catch {
      // Il claim non viene rilasciato: anche su errore inatteso, il limite
      // rigido di chiamate settimanali resta rispettato.
      logger.error('Meal plan allergen monitor scheduler failed', {
        tag: 'MEAL_PLAN_ALLERGEN_MONITOR',
        outcome: 'unavailable',
        attempts: 0,
        violationCodes: [],
      });
    }
  };
  const first = setTimeout(() => void tick(), FIRST_RUN_DELAY_MS) as unknown as { unref?: () => void };
  first.unref?.();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}