import type { Request, Response, NextFunction } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsage } from "../../shared/schema";
import { getParam } from "./http-params";
import { logger } from "./logger";

export type AiFeature =
  | "shopping-suggestions"
  | "recipe-search"
  | "recipe-suggestions"
  | "weekly-meal-plan"
  | "insights"
  | "chore-optimization";

/** Limiti giornalieri per famiglia (numero di generazioni riuscite al giorno). */
export const AI_DAILY_LIMITS: Record<AiFeature, number> = {
  "shopping-suggestions": 10,
  "recipe-search": 20,
  "recipe-suggestions": 10,
  "weekly-meal-plan": 3,
  insights: 5,
  "chore-optimization": 10,
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Conta gli usi RIUSCITI di una feature per una famiglia nella giornata corrente.
 * Solo i successi consumano quota (i fallimenti del provider non penalizzano l'utente).
 */
export async function countTodaySuccess(familyId: string, feature: AiFeature): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.familyId, familyId),
        eq(aiUsage.feature, feature),
        eq(aiUsage.success, true),
        gte(aiUsage.createdAt, startOfToday()),
      ),
    );
  return row?.count ?? 0;
}

/** Registra un uso (successo o fallimento). Non lancia: il logging non deve rompere la richiesta. */
export async function recordAiUsage(
  userId: string,
  familyId: string,
  feature: AiFeature,
  success: boolean,
): Promise<void> {
  try {
    await db.insert(aiUsage).values({ userId, familyId, feature, success });
  } catch (err) {
    logger.error("Failed to record AI usage", { feature, success, error: String(err) });
  }
}

// Indirezione per i test: permette di iniettare un contatore quota senza DB.
type QuotaCounter = (familyId: string, feature: AiFeature) => Promise<number>;
let quotaCounter: QuotaCounter = countTodaySuccess;

/** Test-only: sostituisce il contatore quota. */
export function __setQuotaCounterForTest(fn: QuotaCounter): void {
  quotaCounter = fn;
}
/** Test-only: ripristina il contatore quota reale. */
export function __resetQuotaCounterForTest(): void {
  quotaCounter = countTodaySuccess;
}

/**
 * Middleware factory: blocca la richiesta con 429 AI_RATE_LIMITED se la quota
 * giornaliera per famiglia è stata superata. Richiede req.params.familyId.
 */
export function aiRateLimit(feature: AiFeature) {
  const max = AI_DAILY_LIMITS[feature];
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const familyId = getParam(req, "familyId");
      const used = await quotaCounter(familyId, feature);
      if (used >= max) {
        return res.status(429).json({
          error: {
            code: "AI_RATE_LIMITED",
            message: `Hai raggiunto il limite giornaliero (${max}) per questa funzione AI. Riprova domani.`,
          },
        });
      }
      next();
    } catch (err) {
      logger.error("AI rate limit check failed", { feature, error: String(err) });
      // In caso di errore nel controllo quota, non blocchiamo l'utente.
      next();
    }
  };
}
