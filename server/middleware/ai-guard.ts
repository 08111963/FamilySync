import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { config } from "../lib/config";
import { isPremium as isFamilyPremium } from "../lib/entitlements";

/**
 * Controllo accesso alle funzionalità AI.
 *
 * Regola (vedi anche config.aiRequiresPremium):
 * 1. L'utente deve avere il consenso AI attivo (toggle GDPR users.aiFeaturesEnabled).
 * 2. Se config.aiRequiresPremium è true, la famiglia indicata in :familyId deve
 *    risultare Premium secondo isPremium(familyId) (fonte di verità unica =
 *    entitlements/acquisti store-native). Con il flag a false (stato attuale)
 *    l'AI resta accessibile a tutti gli utenti consenzienti, e la differenza
 *    free/premium è SOLO nelle quote (vedi ai-usage.ts).
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

      // Fonte di verità UNICA: entitlements (acquisti store-native), non
      // families.subscriptionStatus. Fail-closed in caso di errore.
      const premium = familyId ? await isFamilyPremium(familyId) : false;

      if (!premium) {
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
