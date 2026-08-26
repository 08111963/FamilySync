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
 * 1. L'utente deve avere completato l'onboarding e non essere un profilo
 *    bambino o sotto i 14 anni.
 * 2. Se config.aiRequiresPremium è true, la famiglia indicata in :familyId deve
 *    risultare Premium secondo isPremium(familyId) (fonte di verità unica =
 *    entitlements/acquisti store-native). Con il flag a false (stato attuale)
 *    l'AI resta accessibile a tutti gli utenti idonei, e la differenza
 *    free/premium è SOLO nelle quote (vedi ai-usage.ts).
 */
export async function requireAiEnabled(req: Request, res: Response, next: NextFunction) {
  try {
    const [user] = await db
      .select({ ageBand: users.ageBand, isChildAccount: users.isChildAccount })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user) {
      return res.status(403).json({
        error: {
          code: "AI_UNAVAILABLE",
          message: "Le funzionalità AI non sono disponibili per questo account.",
        },
      });
    }

    // Fascia d'età OBBLIGATORIA prima di usare l'AI: gli account creati prima
    // dell'introduzione devono completare l'onboarding (nessun default adulto).
    if (!user.ageBand) {
      return res.status(403).json({
        error: {
          code: "ONBOARDING_REQUIRED",
          message: "Completa il tuo profilo (fascia d'età) nelle impostazioni per usare le funzionalità AI.",
        },
      });
    }

    // Le funzioni AI non sono progettate per l'uso autonomo da parte di
    // minori di 14 anni: blocco lato server indipendente dal toggle.
    if (user.ageBand === "under14" || user.isChildAccount) {
      return res.status(403).json({
        error: {
          code: "AI_DISABLED_MINOR",
          message: "Le funzionalità AI non sono disponibili per i profili sotto i 14 anni.",
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
