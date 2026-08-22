import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { logger } from './logger';
import { sendMealPlanLatencyAlertEmail } from './email';

/**
 * Budget operativi per una singola richiesta del provider.
 *
 * Il percorso standard e quello con vincoli usano entrambi un contratto
 * settimanale. I retry sono campioni separati: il percorso vincolato può
 * effettuare al massimo un repair globale.
 */
export const MEAL_PLAN_LATENCY_BUDGETS = {
  standard: {
    durationMs: 30_000,
    modelCalls: 1,
  },
  constrained: {
    durationMs: 60_000,
    modelCalls: 2,
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
   * Budget della configurazione corrente. Il percorso vincolato può avere un
   * tentativo iniziale e un solo repair; se assente resta il default di 2.
   */
  modelCallBudget?: number;
  preparationDurationMs?: number;
  providerDurationMs?: number;
  parsingDurationMs?: number;
  validationDurationMs?: number;
  responseChars?: number;
  repairAttempt?: boolean;
}

export interface MealPlanLatencySnapshot {
  mode: MealPlanLatencyMode;
  sampleCount: number;
  normalSampleCount: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  averagePreparationDurationMs: number;
  p50PreparationDurationMs: number;
  p95PreparationDurationMs: number;
  averageProviderDurationMs: number;
  p50ProviderDurationMs: number;
  p95ProviderDurationMs: number;
  averageParsingDurationMs: number;
  p50ParsingDurationMs: number;
  p95ParsingDurationMs: number;
  averageValidationDurationMs: number;
  p50ValidationDurationMs: number;
  p95ValidationDurationMs: number;
  averageResponseChars: number;
  repairSampleCount: number;
  p50RepairDurationMs: number;
  p95RepairDurationMs: number;
  p50RepairPreparationDurationMs: number;
  p95RepairPreparationDurationMs: number;
  p50RepairProviderDurationMs: number;
  p95RepairProviderDurationMs: number;
  p50RepairParsingDurationMs: number;
  p95RepairParsingDurationMs: number;
  p50RepairValidationDurationMs: number;
  p95RepairValidationDurationMs: number;
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

export interface MealPlanLatencyOperationalAlert {
  mode: MealPlanLatencyMode;
  signal: Exclude<MealPlanLatencySnapshot['signal'], null>;
  sampleCount: number;
  consecutiveOverDurationBudget: number;
  consecutiveOverModelCallBudget: number;
  averageDurationMs: number;
  p95DurationMs: number;
  averageModelCalls: number;
  durationBudgetMs: number;
  modelCallBudget: number;
}

interface StoredSample {
  durationMs: number;
  preparationDurationMs: number;
  providerDurationMs: number;
  parsingDurationMs: number;
  validationDurationMs: number;
  responseChars: number;
  repairAttempt: boolean;
  modelCalls: number;
  modelCallBudget: number;
  overDurationBudget: boolean;
  overModelCallBudget: boolean;
}

const samplesByMode: Record<MealPlanLatencyMode, StoredSample[]> = {
  standard: [],
  constrained: [],
};

type MealPlanLatencyNotifier = (alert: MealPlanLatencyOperationalAlert) => Promise<number>;
let mealPlanLatencyNotifier: MealPlanLatencyNotifier = sendMealPlanLatencyAlertEmail;

export interface MealPlanLatencyDurableTransition {
  lifecycle: 'opened' | 'recovered' | null;
  mode: MealPlanLatencyMode;
  signal: MealPlanLatencyOperationalAlert['signal'] | null;
  consecutiveOverDurationBudget: number;
  consecutiveOverModelCallBudget: number;
  notificationClaimId: string | null;
}

type MealPlanLatencyStateRecorder = (input: {
  mode: MealPlanLatencyMode;
  overDurationBudget: boolean;
  overModelCallBudget: boolean;
}) => Promise<MealPlanLatencyDurableTransition>;
let mealPlanLatencyStateRecorder: MealPlanLatencyStateRecorder =
  recordMealPlanLatencyDurableState;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index]!;
}

function average(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
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

function alertFromSnapshot(
  snapshot: MealPlanLatencySnapshot,
  transition: MealPlanLatencyDurableTransition,
): MealPlanLatencyOperationalAlert | null {
  if (!transition.signal) return null;
  return {
    mode: snapshot.mode,
    signal: transition.signal,
    sampleCount: snapshot.sampleCount,
    consecutiveOverDurationBudget: transition.consecutiveOverDurationBudget,
    consecutiveOverModelCallBudget: transition.consecutiveOverModelCallBudget,
    averageDurationMs: snapshot.averageDurationMs,
    p95DurationMs: snapshot.p95DurationMs,
    averageModelCalls: snapshot.averageModelCalls,
    durationBudgetMs: snapshot.durationBudgetMs,
    modelCallBudget: snapshot.modelCallBudget,
  };
}

/**
 * Aggiorna il ciclo operativo con un lock di riga transazionale. Il contatore
 * vive nel DB anziché nella memoria dell'istanza: i campioni di istanze diverse
 * partecipano allo stesso streak e la transizione aperto/risolto avviene una
 * sola volta, anche con autoscale o riavvii.
 */
export async function recordMealPlanLatencyDurableState(input: {
  mode: MealPlanLatencyMode;
  overDurationBudget: boolean;
  overModelCallBudget: boolean;
}): Promise<MealPlanLatencyDurableTransition> {
  return db.transaction(async (tx) => {
    // Crea il cursore per modalità, se necessario. ON CONFLICT serializza anche
    // due prime richieste concorrenti prima del SELECT ... FOR UPDATE.
    await tx.execute(sql`
      INSERT INTO meal_plan_latency_alert_state (
        mode,
        consecutive_over_duration_budget,
        consecutive_over_model_call_budget,
        episode_active,
        notification_delivered,
        updated_at
      )
      VALUES (${input.mode}, 0, 0, false, false, now())
      ON CONFLICT (mode) DO NOTHING
    `);
    const selected = await tx.execute(sql`
      SELECT
        consecutive_over_duration_budget,
        consecutive_over_model_call_budget,
        episode_active,
        notification_delivered,
        notification_claim_id,
        notification_claimed_at
      FROM meal_plan_latency_alert_state
      WHERE mode = ${input.mode}
      FOR UPDATE
    `);
    const current = selected.rows[0] as {
      consecutive_over_duration_budget: number;
      consecutive_over_model_call_budget: number;
      episode_active: boolean;
      notification_delivered: boolean;
      notification_claim_id: string | null;
      notification_claimed_at: Date | string | null;
    } | undefined;
    if (!current) {
      throw new Error('meal plan latency state row was not created');
    }

    const consecutiveOverDurationBudget = input.overDurationBudget
      ? Number(current.consecutive_over_duration_budget) + 1
      : 0;
    const consecutiveOverModelCallBudget = input.overModelCallBudget
      ? Number(current.consecutive_over_model_call_budget) + 1
      : 0;
    const signal = signalFor(
      consecutiveOverDurationBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK,
      consecutiveOverModelCallBudget >= MEAL_PLAN_LATENCY_ALERT_STREAK,
    );
    const episodeActive = signal !== null;
    const lifecycle = !current.episode_active && episodeActive
      ? 'opened'
      : current.episode_active && !episodeActive
        ? 'recovered'
        : null;
    const claimExpired =
      current.notification_claimed_at === null ||
      Date.now() - new Date(current.notification_claimed_at).getTime() >= 5 * 60 * 1000;
    const shouldClaimNotification =
      episodeActive &&
      !current.notification_delivered &&
      (current.notification_claim_id === null || claimExpired);
    const notificationClaimId = shouldClaimNotification ? randomUUID() : null;
    const storedNotificationClaimId = notificationClaimId ??
      (episodeActive && !current.notification_delivered
        ? current.notification_claim_id
        : null);
    const storedNotificationClaimedAt = notificationClaimId
      ? new Date()
      : episodeActive && !current.notification_delivered
        ? current.notification_claimed_at
        : null;
    const notificationDelivered = episodeActive ? current.notification_delivered : false;

    await tx.execute(sql`
      UPDATE meal_plan_latency_alert_state
      SET
        consecutive_over_duration_budget = ${consecutiveOverDurationBudget},
        consecutive_over_model_call_budget = ${consecutiveOverModelCallBudget},
        episode_active = ${episodeActive},
        notification_delivered = ${notificationDelivered},
        notification_claim_id = ${storedNotificationClaimId},
        notification_claimed_at = ${storedNotificationClaimedAt},
        updated_at = now()
      WHERE mode = ${input.mode}
    `);

    return {
      lifecycle,
      mode: input.mode,
      signal,
      consecutiveOverDurationBudget,
      consecutiveOverModelCallBudget,
      notificationClaimId,
    };
  });
}

/** Solo per test di integrazione: cancella lo stato operativo condiviso. */
export async function resetMealPlanLatencyDurableStateForTest(): Promise<void> {
  await db.execute(sql`DELETE FROM meal_plan_latency_alert_state`);
}

async function markMealPlanLatencyNotificationDelivered(
  mode: MealPlanLatencyMode,
  claimId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE meal_plan_latency_alert_state
    SET notification_delivered = true,
        notification_claim_id = NULL,
        notification_claimed_at = NULL,
        updated_at = now()
    WHERE mode = ${mode}
      AND episode_active = true
      AND notification_claim_id = ${claimId}
    RETURNING mode
  `);
  return (result.rows?.length ?? 0) > 0;
}

async function releaseMealPlanLatencyNotificationClaim(
  mode: MealPlanLatencyMode,
  claimId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE meal_plan_latency_alert_state
    SET notification_claim_id = NULL,
        notification_claimed_at = NULL,
        updated_at = now()
    WHERE mode = ${mode}
      AND episode_active = true
      AND notification_delivered = false
      AND notification_claim_id = ${claimId}
  `);
}

function notifyOpenedEpisode(alert: MealPlanLatencyOperationalAlert, claimId: string): void {
  // La telemetria non deve trattenere la risposta al piano pasti, né farla
  // fallire. L'evento strutturato è già stato scritto nel canale operativo;
  // l'email è una notifica best-effort aggiuntiva.
  void mealPlanLatencyNotifier(alert)
    .then((recipients) => {
      void markMealPlanLatencyNotificationDelivered(alert.mode, claimId)
        .then(() => {
          logger.info('Meal plan latency alert notification dispatched', {
            tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
            lifecycle: 'opened',
            mode: alert.mode,
            recipients,
          });
        })
        .catch(() => {
          // Il provider potrebbe aver accettato l'email, quindi non rilasciamo
          // il claim subito. Alla sua scadenza un campione persistente ritenta.
          logger.error('Meal plan latency notification delivery state failed', {
            tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
            mode: alert.mode,
          });
        });
    })
    .catch(() => {
      // Mai registrare l'errore del provider email: potrebbe contenere dettagli
      // del destinatario. Il tag permette comunque l'osservazione del guasto.
      void releaseMealPlanLatencyNotificationClaim(alert.mode, claimId)
        .catch(() => {
          // Anche se il rilascio fallisce il claim scade: i campioni successivi
          // potranno ritentare senza lasciare l'episodio bloccato per sempre.
        })
        .finally(() => {
          logger.error('Meal plan latency alert notification failed', {
            tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
            lifecycle: 'opened',
            mode: alert.mode,
            notification: 'failed',
          });
        });
    });
}

function persistOperationalEpisode(
  sample: MealPlanLatencySample,
  snapshot: MealPlanLatencySnapshot,
): void {
  void mealPlanLatencyStateRecorder({
    mode: sample.mode,
    overDurationBudget: sample.durationMs > snapshot.durationBudgetMs,
    overModelCallBudget: sample.modelCalls > snapshot.modelCallBudget,
  })
    .then((transition) => {
      if (transition.lifecycle === 'opened') {
        const alert = alertFromSnapshot(snapshot, transition);
        if (!alert) return;
        logger.operationalAlert('Meal plan latency regression opened', {
          tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
          lifecycle: 'opened',
          alertKey: `meal_plan_latency:${alert.mode}`,
          ...alert,
        });
        if (transition.notificationClaimId) {
          notifyOpenedEpisode(alert, transition.notificationClaimId);
        }
      } else if (transition.notificationClaimId) {
        // Fallimento precedente: stesso episodio, nessun secondo evento di
        // apertura, ma un nuovo claim può ritentare la consegna.
        const alert = alertFromSnapshot(snapshot, transition);
        if (alert) notifyOpenedEpisode(alert, transition.notificationClaimId);
      } else if (transition.lifecycle === 'recovered') {
        logger.operationalAlert('Meal plan latency regression recovered', {
          tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
          lifecycle: 'recovered',
          alertKey: `meal_plan_latency:${transition.mode}`,
          mode: transition.mode,
        });
      }
    })
    .catch(() => {
      // Senza lo stato condiviso non possiamo garantire deduplica tra istanze:
      // non inviamo email, ma rendiamo il guasto osservabile senza loggare
      // dettagli DB/provider potenzialmente sensibili.
      logger.error('Meal plan latency alert state persistence failed', {
        tag: 'AI_MEAL_PLAN_LATENCY_ALERT',
        mode: sample.mode,
      });
    });
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
  const optionalMetrics = [
    sample.preparationDurationMs,
    sample.providerDurationMs,
    sample.parsingDurationMs,
    sample.validationDurationMs,
    sample.responseChars,
  ];
  if (optionalMetrics.some((value) =>
    value !== undefined && (!Number.isFinite(value) || value < 0))) return null;
  const modeSamples = samplesByMode[sample.mode];
  modeSamples.push({
    durationMs: Math.round(sample.durationMs),
    preparationDurationMs: Math.round(sample.preparationDurationMs ?? 0),
    providerDurationMs: Math.round(sample.providerDurationMs ?? 0),
    parsingDurationMs: Math.round(sample.parsingDurationMs ?? 0),
    validationDurationMs: Math.round(sample.validationDurationMs ?? 0),
    responseChars: Math.round(sample.responseChars ?? 0),
    repairAttempt: sample.repairAttempt === true,
    modelCalls: sample.modelCalls,
    modelCallBudget,
    overDurationBudget: sample.durationMs > budget.durationMs,
    overModelCallBudget: sample.modelCalls > modelCallBudget,
  });
  if (modeSamples.length > MAX_SAMPLES_PER_MODE) modeSamples.shift();

  // I percentili del percorso normale non devono incorporare i retry di
  // repair: questi ultimi sono una serie distinta, così possiamo capire se
  // un rallentamento nasce dal modello o dalla correzione globale.
  const normalSamples = modeSamples.filter((current) => !current.repairAttempt);
  const repairSamples = modeSamples.filter((current) => current.repairAttempt);
  const durations = normalSamples.map((current) => current.durationMs);
  const preparationDurations = normalSamples.map((current) => current.preparationDurationMs);
  const providerDurations = normalSamples.map((current) => current.providerDurationMs);
  const parsingDurations = normalSamples.map((current) => current.parsingDurationMs);
  const validationDurations = normalSamples.map((current) => current.validationDurationMs);
  const responseChars = normalSamples.map((current) => current.responseChars);
  const repairDurations = repairSamples.map((current) => current.durationMs);
  const repairPreparationDurations = repairSamples.map((current) => current.preparationDurationMs);
  const repairProviderDurations = repairSamples.map((current) => current.providerDurationMs);
  const repairParsingDurations = repairSamples.map((current) => current.parsingDurationMs);
  const repairValidationDurations = repairSamples.map((current) => current.validationDurationMs);
  const averageDurationMs = average(durations);
  const averageModelCalls = Number(
    (normalSamples.reduce((sum, current) => sum + current.modelCalls, 0) / Math.max(1, normalSamples.length)).toFixed(2),
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
    normalSampleCount: normalSamples.length,
    averageDurationMs,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    averagePreparationDurationMs: average(preparationDurations),
    p50PreparationDurationMs: percentile(preparationDurations, 0.5),
    p95PreparationDurationMs: percentile(preparationDurations, 0.95),
    averageProviderDurationMs: average(providerDurations),
    p50ProviderDurationMs: percentile(providerDurations, 0.5),
    p95ProviderDurationMs: percentile(providerDurations, 0.95),
    averageParsingDurationMs: average(parsingDurations),
    p50ParsingDurationMs: percentile(parsingDurations, 0.5),
    p95ParsingDurationMs: percentile(parsingDurations, 0.95),
    averageValidationDurationMs: average(validationDurations),
    p50ValidationDurationMs: percentile(validationDurations, 0.5),
    p95ValidationDurationMs: percentile(validationDurations, 0.95),
    averageResponseChars: average(responseChars),
    repairSampleCount: repairDurations.length,
    p50RepairDurationMs: percentile(repairDurations, 0.5),
    p95RepairDurationMs: percentile(repairDurations, 0.95),
    p50RepairPreparationDurationMs: percentile(repairPreparationDurations, 0.5),
    p95RepairPreparationDurationMs: percentile(repairPreparationDurations, 0.95),
    p50RepairProviderDurationMs: percentile(repairProviderDurations, 0.5),
    p95RepairProviderDurationMs: percentile(repairProviderDurations, 0.95),
    p50RepairParsingDurationMs: percentile(repairParsingDurations, 0.5),
    p95RepairParsingDurationMs: percentile(repairParsingDurations, 0.95),
    p50RepairValidationDurationMs: percentile(repairValidationDurations, 0.5),
    p95RepairValidationDurationMs: percentile(repairValidationDurations, 0.95),
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
    normalSampleCount: snapshot.normalSampleCount,
    averageDurationMs: snapshot.averageDurationMs,
    p50DurationMs: snapshot.p50DurationMs,
    p95DurationMs: snapshot.p95DurationMs,
    averagePreparationDurationMs: snapshot.averagePreparationDurationMs,
    p50PreparationDurationMs: snapshot.p50PreparationDurationMs,
    p95PreparationDurationMs: snapshot.p95PreparationDurationMs,
    averageProviderDurationMs: snapshot.averageProviderDurationMs,
    p50ProviderDurationMs: snapshot.p50ProviderDurationMs,
    p95ProviderDurationMs: snapshot.p95ProviderDurationMs,
    averageParsingDurationMs: snapshot.averageParsingDurationMs,
    p50ParsingDurationMs: snapshot.p50ParsingDurationMs,
    p95ParsingDurationMs: snapshot.p95ParsingDurationMs,
    averageValidationDurationMs: snapshot.averageValidationDurationMs,
    p50ValidationDurationMs: snapshot.p50ValidationDurationMs,
    p95ValidationDurationMs: snapshot.p95ValidationDurationMs,
    averageResponseChars: snapshot.averageResponseChars,
    repairSampleCount: snapshot.repairSampleCount,
    p50RepairDurationMs: snapshot.p50RepairDurationMs,
    p95RepairDurationMs: snapshot.p95RepairDurationMs,
    p50RepairPreparationDurationMs: snapshot.p50RepairPreparationDurationMs,
    p95RepairPreparationDurationMs: snapshot.p95RepairPreparationDurationMs,
    p50RepairProviderDurationMs: snapshot.p50RepairProviderDurationMs,
    p95RepairProviderDurationMs: snapshot.p95RepairProviderDurationMs,
    p50RepairParsingDurationMs: snapshot.p50RepairParsingDurationMs,
    p95RepairParsingDurationMs: snapshot.p95RepairParsingDurationMs,
    p50RepairValidationDurationMs: snapshot.p50RepairValidationDurationMs,
    p95RepairValidationDurationMs: snapshot.p95RepairValidationDurationMs,
    averageModelCalls: snapshot.averageModelCalls,
    durationBudgetMs: snapshot.durationBudgetMs,
    modelCallBudget: snapshot.modelCallBudget,
    observedModelCallBudgets: snapshot.observedModelCallBudgets,
  });

  persistOperationalEpisode(sample, snapshot);
  return snapshot;
}

/** Solo per test: evita che lo stato in memoria condivida campioni tra casi. */
export function resetMealPlanLatencyMonitorForTest(): void {
  samplesByMode.standard.length = 0;
  samplesByMode.constrained.length = 0;
  mealPlanLatencyNotifier = sendMealPlanLatencyAlertEmail;
  mealPlanLatencyStateRecorder = recordMealPlanLatencyDurableState;
}

/** Solo per test: sostituisce il canale di notifica senza inviare email. */
export function setMealPlanLatencyNotifierForTest(notifier: MealPlanLatencyNotifier): void {
  mealPlanLatencyNotifier = notifier;
}

/** Solo per test unitari: sostituisce lo store condiviso senza usare il DB. */
export function setMealPlanLatencyStateRecorderForTest(recorder: MealPlanLatencyStateRecorder): void {
  mealPlanLatencyStateRecorder = recorder;
}