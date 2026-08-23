import type { AiErrorCode, AiProvider } from "./ai-errors";
import type { MealPlanAttemptTelemetry } from "./openai";
import {
  MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MEAL_PLAN_STREAM_SAFETY_TIMEOUT_MS,
} from "../../shared/meal-plan-generation-timeouts";

type SanitizedAttempt = Pick<
  MealPlanAttemptTelemetry,
  "generationAttempt" | "durationMs" | "providerDurationMs" | "responseChars" | "finishReasons" | "itemsCount" | "failedChunks"
>;

export type MealPlanLastErrorDiagnostic = {
  createdAt: string;
  endpoint: "/api/ai/:familyId/weekly-meal-plan/stream";
  requestId: string;
  durationMs: number;
  provider: AiProvider;
  model: string;
  finishReasons: string[];
  errorCode: AiErrorCode;
  errorMessage: string;
  validationError: string | null;
  itemsReceived: number;
  validSlots: number;
  timeouts: {
    frontendStreamMs: number;
    providerAttemptMs: number;
  };
  attempts: SanitizedAttempt[];
};

let lastError: MealPlanLastErrorDiagnostic | null = null;

export function recordMealPlanLastError(input: Omit<MealPlanLastErrorDiagnostic, "createdAt" | "timeouts">): void {
  lastError = {
    ...input,
    createdAt: new Date().toISOString(),
    timeouts: {
      frontendStreamMs: MEAL_PLAN_STREAM_SAFETY_TIMEOUT_MS,
      providerAttemptMs: MEAL_PLAN_PROVIDER_ATTEMPT_TIMEOUT_MS,
    },
  };
}

export function getMealPlanLastError(): MealPlanLastErrorDiagnostic | null {
  return lastError
    ? {
      ...lastError,
      finishReasons: [...lastError.finishReasons],
      attempts: lastError.attempts.map((attempt) => ({
        ...attempt,
        finishReasons: [...attempt.finishReasons],
      })),
      timeouts: { ...lastError.timeouts },
    }
    : null;
}