import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users, families } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { config } from "../lib/config";

/**
 * Controllo accesso alle funzionalità AI.
 *
 * Regola (vedi anche config.aiRequiresPremium):
 * 1. L'utente deve avere il consenso AI attivo (toggle GDPR users.aiFeaturesEnabled).
 * 2. Se config.aiRequiresPremium è true (cioè quando i pagamenti Premium sono
 *    attivi), la famiglia indicata in :familyId deve avere subscriptionStatus
 *    = "premium". Con il flag a false (stato attuale, pagamenti disattivi) l'AI
 *    resta gratuita per tutti gli utenti consenzienti, limitata dalla quota
 *    giornaliera per famiglia.
 */
export async function requireAiEnabled(req: Request, res: Response, next: NextFunction) {
  try {
    const [user] = await db
      .select({ aiFeaturesEnabled: users.aiFeaturesEnabled })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user || !user.aiFeaturesEnabled) {
      return res.status(403).json({
        error: {
          code: "AI_DISABLED",
          message: "Le funzionalità AI sono disabilitate. Attivale nelle impostazioni per continuare.",
        },
      });
    }

    if (config.aiRequiresPremium) {
      const familyIdParam = req.params.familyId;
      const familyIdBody = req.body?.familyId;
      const familyId =
        typeof familyIdParam === "string"
          ? familyIdParam
          : typeof familyIdBody === "string"
            ? familyIdBody
            : undefined;

      let isPremium = false;
      if (familyId) {
        const [family] = await db
          .select({ subscriptionStatus: families.subscriptionStatus })
          .from(families)
          .where(eq(families.id, familyId))
          .limit(1);
        isPremium = family?.subscriptionStatus === "premium";
      }

      if (!isPremium) {
        return res.status(403).json({
          error: {
            code: "AI_PREMIUM_REQUIRED",
            message: "Le funzionalità AI richiedono un abbonamento Premium attivo per questa famiglia.",
          },
        });
      }
    }

    next();
  } catch {
    return res.status(500).json({
      error: { code: "SERVER_ERROR", message: "Errore nel controllo preferenze AI" },
    });
  }
}
