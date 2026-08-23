import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../shared/schema";
import { isAppOwner } from "../lib/test-analytics";
import { getMealPlanLastError } from "../lib/meal-plan-diagnostics";

async function requireAppOwner(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }
    const [record] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);
    if (!record) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    if (!record.emailVerified || !isAppOwner(record.email)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Accesso riservato al proprietario dell'app" } });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica dei permessi" } });
  }
}

/** Diagnostica transitoria e senza dati utente del più recente errore Piano Pasti. */
export const adminAiRouter = Router();

adminAiRouter.get("/meal-plan-last-error", requireAppOwner, (_req, res) => {
  res.json({ diagnostic: getMealPlanLastError() });
});