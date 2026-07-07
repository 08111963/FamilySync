import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsage } from "../../shared/schema";
import { logger } from "./logger";
import { getPlanForFamily } from "./entitlements";

/**
 * Limiti giornalieri sulle FUNZIONI DI BASE (non AI) del piano FREE.
 *
 * Requisito: nel piano Free le azioni di creazione di Calendario, Spesa,
 * Faccende e Chat NON sono illimitate: sono consentite al massimo
 * BASE_FREE_DAILY_LIMIT al giorno PER FUNZIONE. Il conteggio è PER FAMIGLIA
 * (riserva condivisa tra tutti i membri), come le quote AI. Il piano Premium è
 * illimitato.
 *
 * Il conteggio riusa la tabella `ai_usage` (colonna `feature` = varchar) con un
 * prefisso dedicato ("base:") così da non collidere con le feature AI, e sfrutta
 * lo stesso indice (family_id, feature, created_at) per contare velocemente.
 */
export type BaseFeature = "calendar-event" | "shopping-item" | "chore" | "chat-message";

/** Limite giornaliero per funzione, per famiglia, nel piano FREE. */
export const BASE_FREE_DAILY_LIMIT = 5;

/** Prefisso per distinguere le righe "base" da quelle AI nella tabella ai_usage. */
const FEATURE_PREFIX = "base:";

/** Etichette italiane usate nel messaggio di limite. */
const BASE_LABELS: Record<BaseFeature, string> = {
  "calendar-event": "eventi del calendario",
  "shopping-item": "articoli della spesa",
  chore: "faccende",
  "chat-message": "messaggi in chat",
};

export type BaseUsageResult =
  | { status: "ok" }
  | { status: "limited"; used: number; max: number; feature: BaseFeature };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function lockKey(familyId: string, feature: BaseFeature): string {
  return `base_usage:${familyId}:${feature}`;
}

/**
 * Prenota (conteggio + insert) uno slot per un'azione di base, PRIMA di creare
 * la risorsa. Ritorna:
 * - "ok": azione consentita (Premium = sempre ok; Free = sotto quota);
 * - "limited": quota giornaliera del piano Free raggiunta -> l'handler deve 429.
 *
 * Il conteggio+insert avviene in una transazione protetta da advisory lock su
 * (famiglia, feature), così due richieste concorrenti non superano il limite.
 *
 * Fail-OPEN: se il conteggio non è verificabile (errore DB), l'azione è
 * consentita. Le funzioni di base sono core per l'esperienza d'uso: è preferibile
 * consentire occasionalmente un'azione in più piuttosto che bloccare l'utente per
 * un errore transitorio (a differenza delle funzioni AI, che sono fail-closed
 * perché costose).
 */
export async function reserveBaseSlot(
  userId: string,
  familyId: string,
  feature: BaseFeature,
): Promise<BaseUsageResult> {
  const plan = await getPlanForFamily(familyId);
  // Premium: nessun limite sulle funzioni di base.
  if (plan === "premium") return { status: "ok" };

  const max = BASE_FREE_DAILY_LIMIT;
  const since = startOfToday();
  const dbFeature = FEATURE_PREFIX + feature;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey(familyId, feature)}))`);

      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.familyId, familyId),
            eq(aiUsage.feature, dbFeature),
            gte(aiUsage.createdAt, since),
          ),
        );
      const used = row?.count ?? 0;
      if (used >= max) {
        return { status: "limited", used, max, feature } as const;
      }
      await tx.insert(aiUsage).values({ userId, familyId, feature: dbFeature, status: "succeeded" });
      return { status: "ok" } as const;
    });
  } catch (err) {
    logger.error("reserveBaseSlot failed (fail-open)", { feature, error: String(err) });
    return { status: "ok" };
  }
}

/**
 * Corpo JSON standard per la risposta 429 quando il piano Free raggiunge il
 * limite giornaliero di una funzione di base. Usa il codice FREE_DAILY_LIMIT_REACHED
 * così il frontend può mostrare un messaggio uniforme (ed eventualmente l'upsell).
 */
export function baseLimitBody(result: { max: number; feature: BaseFeature }) {
  return {
    error: {
      code: "FREE_DAILY_LIMIT_REACHED",
      message: `Hai raggiunto il limite giornaliero del piano Free (${result.max} ${BASE_LABELS[result.feature]} al giorno, condivisi da tutta la famiglia). Passa a Premium per usarne quanti vuoi, oppure riprova domani.`,
      feature: result.feature,
      max: result.max,
    },
  };
}
