import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsage } from "../../shared/schema";
import { logger } from "./logger";
import { assertAiConfigured } from "./ai-errors";

export type AiFeature =
  | "shopping-suggestions"
  | "recipe-search"
  | "recipe-suggestions"
  | "weekly-meal-plan"
  | "insights"
  | "chore-optimization";

export type AiUsageStatus = "started" | "succeeded" | "failed";

/**
 * Limiti giornalieri per famiglia (numero di TENTATIVI al giorno).
 * Contano tutti i tentativi che raggiungono OpenAI, riusciti o falliti,
 * perché entrambi consumano token/costi.
 */
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

function lockKey(familyId: string, feature: AiFeature): string {
  return `ai_usage:${familyId}:${feature}`;
}

/** Esito di una prenotazione di slot quota. */
export type ReserveResult =
  | { status: "ok"; usageId: string; used: number }
  | { status: "limited"; used: number; max: number }
  | { status: "unavailable" };

/**
 * Astrazione dello storage uso AI. In produzione è il DB; nei test si inietta
 * un'implementazione in memoria via __setAiUsageStoreForTest.
 */
export interface AiUsageStore {
  reserve(
    userId: string,
    familyId: string,
    feature: AiFeature,
    max: number,
  ): Promise<ReserveResult>;
  finalize(usageId: string, success: boolean): Promise<void>;
}

/**
 * Store DB-backed. La prenotazione (conteggio + insert "started") avviene dentro
 * una TRANSAZIONE protetta da un advisory lock Postgres per (famiglia, feature):
 * questo serializza i tentativi concorrenti della stessa famiglia/feature ed
 * elimina la race condition "due richieste passano il check prima di registrare".
 */
const dbStore: AiUsageStore = {
  async reserve(userId, familyId, feature, max) {
    try {
      return await db.transaction(async (tx) => {
        // Serializza i concorrenti sulla stessa (famiglia, feature) finché la
        // transazione non termina (commit/rollback rilascia il lock).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(familyId, feature)}))`);

        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.familyId, familyId),
              eq(aiUsage.feature, feature),
              gte(aiUsage.createdAt, startOfToday()),
            ),
          );
        const used = row?.count ?? 0;
        if (used >= max) {
          return { status: "limited", used, max } as const;
        }
        const [inserted] = await tx
          .insert(aiUsage)
          .values({ userId, familyId, feature, status: "started" })
          .returning({ id: aiUsage.id });
        return { status: "ok", usageId: inserted!.id, used: used + 1 } as const;
      });
    } catch (err) {
      logger.error("reserveAiSlot failed", { feature, error: String(err) });
      return { status: "unavailable" } as const;
    }
  },

  async finalize(usageId, success) {
    try {
      await db
        .update(aiUsage)
        .set({ status: success ? "succeeded" : "failed", updatedAt: new Date() })
        .where(eq(aiUsage.id, usageId));
    } catch (err) {
      logger.error("finalizeAiUsage failed", { usageId, success, error: String(err) });
    }
  },
};

let store: AiUsageStore = dbStore;

/** Test-only: inietta uno store in memoria. */
export function __setAiUsageStoreForTest(s: AiUsageStore): void {
  store = s;
}
/** Test-only: ripristina lo store DB reale. */
export function __resetAiUsageStoreForTest(): void {
  store = dbStore;
}

/**
 * Prenota uno slot quota PRIMA della chiamata OpenAI.
 * - "ok": slot prenotato (record "started" creato), va chiamato OpenAI.
 * - "limited": quota giornaliera raggiunta -> 429.
 * - "unavailable": impossibile verificare la quota (DB giù) -> fail-closed 503
 *   per le funzioni costose, o fallback locale per shopping.
 *
 * Se la chiave OpenAI manca del tutto, lancia AiError("AI_NOT_CONFIGURED")
 * PRIMA di toccare lo store: così non viene creato alcun record ai_usage quando
 * OpenAI non può nemmeno partire (nessun consumo di quota). NB: una chiave
 * presente ma rifiutata dal provider (401/403) supera questo controllo, quindi
 * il record "started" viene creato e poi finalizzato "failed" perché OpenAI è
 * stato effettivamente chiamato.
 */
export async function reserveAiSlot(
  userId: string,
  familyId: string,
  feature: AiFeature,
): Promise<ReserveResult> {
  assertAiConfigured();
  return store.reserve(userId, familyId, feature, AI_DAILY_LIMITS[feature]);
}

/** Aggiorna un record "started" a "succeeded"/"failed". Non lancia mai. */
export async function finalizeAiUsage(usageId: string, success: boolean): Promise<void> {
  return store.finalize(usageId, success);
}

/** Esito dell'esecuzione di una funzione AI con tracciamento uso. */
export type AiUsageRun<T> =
  | { outcome: "ok"; value: T }
  | { outcome: "limited"; used: number; max: number }
  | { outcome: "unavailable" };

/**
 * Esegue `fn` (la chiamata OpenAI) tracciando l'uso:
 * 1. prenota uno slot (record "started") in modo atomico;
 * 2. se quota piena -> { outcome: "limited" } (OpenAI NON chiamato);
 * 3. se quota non verificabile -> { outcome: "unavailable" } (OpenAI NON chiamato);
 * 4. esegue `fn`; in caso di successo finalizza "succeeded" e ritorna il valore;
 * 5. in caso di errore finalizza "failed" e RILANCIA (così l'handler mappa l'AiError).
 *
 * Pensata per le funzioni che NON hanno fallback locale. Shopping usa direttamente
 * reserveAiSlot/finalizeAiUsage perché in caso di "unavailable" deve degradare al
 * fallback locale senza chiamare OpenAI.
 */
export async function withAiUsage<T>(
  ctx: { userId: string; familyId: string; feature: AiFeature },
  fn: () => Promise<T>,
): Promise<AiUsageRun<T>> {
  const reservation = await reserveAiSlot(ctx.userId, ctx.familyId, ctx.feature);
  if (reservation.status === "limited") {
    return { outcome: "limited", used: reservation.used, max: reservation.max };
  }
  if (reservation.status === "unavailable") {
    return { outcome: "unavailable" };
  }
  const usageId = reservation.usageId;
  try {
    const value = await fn();
    await finalizeAiUsage(usageId, true);
    return { outcome: "ok", value };
  } catch (err) {
    await finalizeAiUsage(usageId, false);
    throw err;
  }
}
