import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsage, familyMembers } from "../../shared/schema";
import { logger } from "./logger";
import { assertAiConfigured } from "./ai-errors";
import { getPlanForFamily, type Plan } from "./entitlements";

export type AiFeature =
  | "shopping-suggestions"
  | "recipe-search"
  | "recipe-suggestions"
  | "weekly-meal-plan"
  | "insights"
  | "chore-optimization"
  | "voice-transcription"
  | "recipe-image";

export type AiUsageStatus = "started" | "succeeded" | "failed";

/** Finestra temporale della quota: giornaliera o settimanale. */
export type QuotaWindow = "day" | "week";

export interface FeatureLimit {
  max: number;
  window: QuotaWindow;
}

/**
 * Quote AI per PIANO. Contano tutti i tentativi che raggiungono OpenAI (riusciti
 * o falliti), perché entrambi consumano token/costi.
 *
 * - free: quota "demo" minima — l'AI resta provabile senza pagare, ma è limitata.
 * - premium: quota ampia, sbloccata dall'acquisto store-native (isPremium).
 *
 * Il Premium NON è un pagamento separato per l'AI: è il piano unico della
 * famiglia. La differenza free/premium è SOLO nelle quote qui sotto.
 */
export const PLAN_LIMITS: Record<Plan, Record<AiFeature, FeatureLimit>> = {
  free: {
    "shopping-suggestions": { max: 2, window: "day" },
    "recipe-search": { max: 2, window: "day" },
    "recipe-suggestions": { max: 1, window: "day" },
    "weekly-meal-plan": { max: 1, window: "week" },
    insights: { max: 1, window: "week" },
    "chore-optimization": { max: 1, window: "day" },
    "voice-transcription": { max: 3, window: "day" },
    "recipe-image": { max: 10, window: "day" },
  },
  premium: {
    "shopping-suggestions": { max: 15, window: "day" },
    "recipe-search": { max: 25, window: "day" },
    "recipe-suggestions": { max: 15, window: "day" },
    "weekly-meal-plan": { max: 8, window: "day" },
    insights: { max: 10, window: "day" },
    "chore-optimization": { max: 15, window: "day" },
    "voice-transcription": { max: 35, window: "day" },
    "recipe-image": { max: 55, window: "day" },
  },
};

/**
 * Limiti giornalieri Premium (retrocompatibilità). Mantenuto come alias delle
 * quote premium giornaliere: alcuni test/strumenti vi fanno riferimento.
 */
export const AI_DAILY_LIMITS: Record<AiFeature, number> = {
  "shopping-suggestions": PLAN_LIMITS.premium["shopping-suggestions"].max,
  "recipe-search": PLAN_LIMITS.premium["recipe-search"].max,
  "recipe-suggestions": PLAN_LIMITS.premium["recipe-suggestions"].max,
  "weekly-meal-plan": PLAN_LIMITS.premium["weekly-meal-plan"].max,
  insights: PLAN_LIMITS.premium.insights.max,
  "chore-optimization": PLAN_LIMITS.premium["chore-optimization"].max,
  "voice-transcription": PLAN_LIMITS.premium["voice-transcription"].max,
  "recipe-image": PLAN_LIMITS.premium["recipe-image"].max,
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inizio settimana corrente (lunedì 00:00, ora locale). */
function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dayFromMonday = (d.getDay() + 6) % 7; // domenica=6, lunedì=0
  d.setDate(d.getDate() - dayFromMonday);
  return d;
}

function windowStart(window: QuotaWindow): Date {
  return window === "week" ? startOfWeek() : startOfToday();
}

function lockKey(familyId: string, feature: AiFeature): string {
  return `ai_usage:${familyId}:${feature}`;
}

/** Esito di una prenotazione di slot quota. */
export type ReserveResult =
  | { status: "ok"; usageId: string; used: number }
  | { status: "limited"; used: number; max: number; window: QuotaWindow }
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
    since: Date,
    window: QuotaWindow,
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
  async reserve(userId, familyId, feature, max, since, window) {
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
              gte(aiUsage.createdAt, since),
            ),
          );
        const used = row?.count ?? 0;
        if (used >= max) {
          return { status: "limited", used, max, window } as const;
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

/** Limite (max + finestra) applicabile a una famiglia per una feature. */
export async function resolveFeatureLimit(familyId: string, feature: AiFeature): Promise<FeatureLimit> {
  const plan = await getPlanForFamily(familyId);
  return PLAN_LIMITS[plan][feature];
}

/**
 * Gli admin della famiglia non hanno limiti AI: bypassano la quota del piano.
 * L'uso viene comunque tracciato (record ai_usage), ma non viene mai bloccato.
 */
async function isFamilyAdmin(userId: string, familyId: string): Promise<boolean> {
  try {
    const [m] = await db
      .select({ role: familyMembers.role })
      .from(familyMembers)
      .where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)))
      .limit(1);
    return m?.role === "admin";
  } catch (err) {
    logger.error("isFamilyAdmin check failed", { userId, familyId, error: String(err) });
    return false;
  }
}

/**
 * Prenota uno slot quota PRIMA della chiamata OpenAI.
 * - "ok": slot prenotato (record "started" creato), va chiamato OpenAI.
 * - "limited": quota del piano raggiunta -> 429.
 * - "unavailable": impossibile verificare la quota (DB giù) -> fail-closed 503
 *   per le funzioni costose, o fallback locale per shopping.
 *
 * La quota dipende dal PIANO della famiglia (free/premium) ed è risolta qui via
 * getPlanForFamily: il chiamante non deve conoscere il piano.
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
  const { max, window } = await resolveFeatureLimit(familyId, feature);
  // Admin: nessun limite. Tracciamo comunque l'uso, ma con tetto "illimitato".
  const admin = await isFamilyAdmin(userId, familyId);
  const effectiveMax = admin ? Number.MAX_SAFE_INTEGER : max;
  return store.reserve(userId, familyId, feature, effectiveMax, windowStart(window), window);
}

/** Aggiorna un record "started" a "succeeded"/"failed". Non lancia mai. */
export async function finalizeAiUsage(usageId: string, success: boolean): Promise<void> {
  return store.finalize(usageId, success);
}

/** Esito dell'esecuzione di una funzione AI con tracciamento uso. */
export type AiUsageRun<T> =
  | { outcome: "ok"; value: T }
  | { outcome: "limited"; used: number; max: number; window: QuotaWindow }
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
    return { outcome: "limited", used: reservation.used, max: reservation.max, window: reservation.window };
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
