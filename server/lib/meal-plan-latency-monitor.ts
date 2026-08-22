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