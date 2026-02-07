import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";

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

    next();
  } catch {
    return res.status(500).json({
      error: { code: "SERVER_ERROR", message: "Errore nel controllo preferenze AI" },
    });
  }
}
