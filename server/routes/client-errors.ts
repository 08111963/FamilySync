import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { logger } from "../lib/logger";

// Endpoint PUBBLICO di segnalazione crash del client (ErrorBoundary).
// Solo log server-side: nessun dato viene salvato su DB né restituito.
// Rate limiter stretto: un client che crasha manda al massimo pochi report.
export const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const reportSchema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  platform: z.string().max(50).optional(),
});

const router = Router();

router.post("/", (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_REPORT" } });
  }
  const { message, stack, url, userAgent, platform } = parsed.data;
  // Il logger di produzione redige già email/token; qui logghiamo solo
  // informazioni tecniche del crash per la diagnosi.
  logger.error("CLIENT_CRASH report", {
    message,
    url,
    userAgent,
    platform,
    stack: stack ? stack.slice(0, 4000) : undefined,
  });
  res.status(204).end();
});

export default router;
