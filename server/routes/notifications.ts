import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { pushTokens } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(1, "Token mancante"),
  platform: z.string().optional(),
});

router.post('/register', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" },
      });
    }

    const { token, platform } = parsed.data;
    const userId = req.user!.userId;

    await db
      .insert(pushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform, updatedAt: new Date() },
      });

    res.status(201).json({ message: 'Token registrato' });
  } catch (error) {
    logger.error('Register push token error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella registrazione del token" } });
  }
});

router.post('/unregister', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi" },
      });
    }

    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, parsed.data.token), eq(pushTokens.userId, req.user!.userId)));
    res.json({ message: 'Token rimosso' });
  } catch (error) {
    logger.error('Unregister push token error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del token" } });
  }
});

export default router;
