import { logger } from './logger';

/**
 * Budget operativi per una singola richiesta del provider.
 *
 * Il percorso standard usa una richiesta compatta; quello con vincoli usa una
 * richiesta per tipo di pasto in parallelo. I retry sono campioni separati:
 * superare il budget di chiamate è quindi un segnale utile anche quando la
 * risposta finale viene comunque prodotta.
 */
export const MEAL_PLAN_LATENCY_BUDGETS = {
  standard: {
    durationMs: 30_000,
    modelCalls: 1,
  },
  constrained: {
    durationMs: 60_000,
    modelCalls: 3,
  },
} as const;

export const MEAL_PLAN_LATENCY_ALERT_STREAK = 3;
const MAX_SAMPLES_PER_MODE = 20;

export type MealPlanLatencyMode = keyof typeof MEAL_PLAN_LATENCY_BUDGETS;

export interface MealPlanLatencySample {
  mode: MealPlanLatencyMode;
  durationMs: number;
  modelCalls: number;
  /**
   * Budget della configurazione corrente. Il percorso vincolato può avere
   * 2, 3 o 4 tipi di pasto; se assente resta il default storico di 3.
   */
  modelCallBudget?: number;
}

export interface MealPlanLatencySnapshot {
  mode: MealPlanLatencyMode;
  sampleCount: number;
  averageDurationMs: number;
  p95DurationMs: number;
  averageModelCalls: number;
  durationBudgetMs: number;
  modelCallBudget: number;
  observedModelCallBudgets: number[];
  consecutiveOverDurationBudget: number;
  consecutiveOverModelCallBudget: number;
  sustainedDurationRegression: boolean;
  sustainedModelCallRegression: boolean;
  signal: 'duration' | 'model_calls' | 'duration_and_model_calls' | null;
}

interface StoredSample {
  durationMs: number;
  modelCalls: number;
  modelCallBudget: number;
  overDurationBudget: boolean;
  overModelCallBudget: boolean;
}

const samplesByMode: Record<MealPlanLatencyMode, StoredSample[]> = {
  standard: [],
  constrained: [],
};

const durationSignalActiveByMode: Record<MealPlanLatencyMode, boolean> = {
  standard: false,
  constrained: false,
};

const modelCallSignalActiveByMode: Record<MealPlanLatencyMode, boolean> = {
  standard: false,
  constrained: false,
};

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index]!;
}

function consecutiveCount(samples: StoredSample[], key: 'overDurationBudget' | 'overModelCallBudget'): number {
  let count = 0;
  for (let i = samples.length - 1; i >= 0 && samples[i]![key]; i--) count++;
  return count;
}

function signalFor(
  durationRegression: boolean,
  modelCallRegression: boolean,
): MealPlanLatencySnapshot['signal'] {
  if (durationRegression && modelCallRegression) return 'duration_and_model_calls';
  if (durationRegression) return 'duration';
  if (modelCallRegression) return 'model_calls';
  return null;
}

/**
 * Registra solo numeri e la categoria del percorso. Il risultato è adatto a
 * log/alert operativi: non contiene famiglia, utente, preferenze, titoli,
 * ingredienti o testo generato.
 */
export function recordMealPlanLatency(sample: MealPlanLatencySample): MealPlanLatencySnapshot | null {
  if (
    !isFiniteNonNegative(sample.durationMs) ||
    !Number.isInteger(sample.modelCalls) ||
    sample.modelCalls < 0 ||
    !Object.hasOwn(MEAL_PLAN_LATENCY_BUDGETS, sample.mode)
  ) {
    return null;
  }

  const budget = MEAL_PLAN_LATENCY_BUDGETS[sample.mode];
  const modelCallBudget = sample.modelCallBudget ?? budget.modelCalls;
  if (!Number.isInteger(modelCallBudget) || modelCallBudget < 1) return null;
  const modeSamples = samplesByMode[sample.mode];
  modeSamples.push({
    durationMs: Math.round(sample.durationMs),
    modelCalls: sample.modelCalls,
    modelCallBudget,
    overDurationBudget: sample.durationMs > budget.durationMs,
    overModelCallBudget: sample.modelCalls > modelCallBudget,
  });
  if (modeSamples.length > MAX_SAMPLES_PER_MODE) modeSamples.shift();

  const averageDurationMs = Math.round(
    modeSamples.reduce((sum, current) => sum + current.durationMs, 0) / modeSamples.length,
  );
  const averageModelCalls = Number(
    (modeSamples.reduce((sum, current) => sum + current.modelCalls, 0) / modeSamples.length).toFixed(2),
  );
  const consecutiveOverDurationBudget = consecutiveCount(modeSamples, 'overDurationBudget');
  const consecutiveOverModelCallBudget = consecutiveCount(modeSamples, 'overModelCallBudget');
  const sustainedDurationRegression =
    consecutiveOverDurationBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK;
  const sustainedModelCallRegression =
    consecutiveOverModelCallBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK;
  const signal = signalFor(sustainedDurationRegression, sustainedModelCallRegression);

  const snapshot: MealPlanLatencySnapshot = {
    mode: sample.mode,
    sampleCount: modeSamples.length,
    averageDurationMs,
    p95DurationMs: Math.round(percentile95(modeSamples.map((current) => current.durationMs))),
    averageModelCalls,
    durationBudgetMs: budget.durationMs,
    modelCallBudget,
    observedModelCallBudgets: Array.from(
      new Set(modeSamples.map((current) => current.modelCallBudget)),
    ).sort((a, b) => a - b),
    consecutiveOverDurationBudget,
    consecutiveOverModelCallBudget,
    sustainedDurationRegression,
    sustainedModelCallRegression,
    signal,
  };

  // Il campione aggregato è sicuro per definizione: vengono emessi soltanto
  // valori numerici e la modalità, mai dati del piano o vincoli dell'utente.
  logger.info('Meal plan latency aggregate', {
    tag: 'AI_MEAL_PLAN_LATENCY',
    mode: snapshot.mode,
    sampleCount: snapshot.sampleCount,
    averageDurationMs: snapshot.averageDurationMs,
    p95DurationMs: snapshot.p95DurationMs,
    averageModelCalls: snapshot.averageModelCalls,
    durationBudgetMs: snapshot.durationBudgetMs,
    modelCallBudget: snapshot.modelCallBudget,
    observedModelCallBudgets: snapshot.observedModelCallBudgets,
  });

  const isNewDurationSignal =
    sustainedDurationRegression && !durationSignalActiveByMode[sample.mode];
  const isNewModelCallSignal =
    sustainedModelCallRegression && !modelCallSignalActiveByMode[sample.mode];
  if (signal && (isNewDurationSignal || isNewModelCallSignal)) {
    logger.warn('Meal plan latency regression suspected', {
      tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
      mode: snapshot.mode,
      signal,
      sampleCount: snapshot.sampleCount,
      consecutiveOverDurationBudget: snapshot.consecutiveOverDurationBudget,
      consecutiveOverModelCallBudget: snapshot.consecutiveOverModelCallBudget,
      averageDurationMs: snapshot.averageDurationMs,
      p95DurationMs: snapshot.p95DurationMs,
      averageModelCalls: snapshot.averageModelCalls,
      durationBudgetMs: snapshot.durationBudgetMs,
      modelCallBudget: snapshot.modelCallBudget,
    });
  }
  // Ogni dimensione chiude il proprio episodio quando torna nel budget. Così
  // un nuovo sforamento sostenuto delle chiamate non viene nascosto da un
  // precedente alert di sola durata (e viceversa).
  durationSignalActiveByMode[sample.mode] = sustainedDurationRegression;
  modelCallSignalActiveByMode[sample.mode] = sustainedModelCallRegression;

  return snapshot;
}

/** Solo per test: evita che lo stato in memoria condivida campioni tra casi. */
export function resetMealPlanLatencyMonitorForTest(): void {
  samplesByMode.standard.length = 0;
  samplesByMode.constrained.length = 0;
  durationSignalActiveByMode.standard = false;
  durationSignalActiveByMode.constrained = false;
  modelCallSignalActiveByMode.standard = false;
  modelCallSignalActiveByMode.constrained = false;
}