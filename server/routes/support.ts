import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { sendSupportRequestEmail, isSupportEmailConfigured } from '../lib/email';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const router = Router();

// Rate limiter dedicato: evita che un account invii troppe richieste di
// assistenza in poco tempo (spam verso la casella assistenza).
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // La route è sempre autenticata: limitiamo per utente, non per IP, così
  // utenti dietro lo stesso NAT/proxy (deployment autoscale) non si bloccano a vicenda.
  keyGenerator: (req) => req.user?.userId ?? 'unauthenticated',
  message: { error: { code: 'RATE_LIMITED', message: 'Hai inviato troppe richieste. Riprova più tardi.' } },
});

const supportSchema = z.object({
  subject: z.string().trim().min(3, 'Inserisci un oggetto').max(150),
  message: z.string().trim().min(10, 'Scrivi un messaggio più dettagliato').max(5000),
});

router.post('/', supportLimiter, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Non autenticato' } });
  }

  const parsed = supportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dati non validi' },
    });
  }

  // In produzione, se la casella di assistenza non è configurata falliamo
  // esplicitamente invece di "perdere" silenziosamente la richiesta.
  if (!isSupportEmailConfigured() && config.isProduction) {
    return res.status(503).json({
      error: { code: 'SUPPORT_NOT_CONFIGURED', message: 'Il servizio di assistenza non è disponibile al momento.' },
    });
  }

  try {
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Utente non trovato' } });
    }

    await sendSupportRequestEmail({
      userName: user.name,
      userEmail: user.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Support request send failed', { error: String(error) });
    return res.status(502).json({
      error: { code: 'SUPPORT_SEND_FAILED', message: 'Non siamo riusciti a inviare la richiesta. Riprova tra poco.' },
    });
  }
});

export default router;
