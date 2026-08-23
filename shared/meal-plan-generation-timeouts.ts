/**
 * Limiti temporali condivisi tra browser e backend per una generazione
 * settimanale. Il backend esegue al massimo il primo tentativo e un repair
 * globale, quindi il browser deve restare in attesa oltre entrambi.
 */
export const MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS = 60_000;
export const MEAL_PLAN_MAX_GENERATION_ATTEMPTS = 2;
export const MEAL_PLAN_STREAM_SAFETY_TIMEOUT_MS = 150_000;