import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { feedbackEntries, users } from '../../shared/schema';
import { desc, eq, gte, sql, count, and } from 'drizzle-orm';
import { z } from 'zod';
import { isAppOwner } from '../lib/test-analytics';
import { sendFeedbackNotificationEmail } from '../lib/email';
import { logger } from '../lib/logger';

/**
 * FEEDBACK TESTER — modulo interno "Dacci il tuo parere".
 *
 * - feedbackRouter (POST /api/feedback): qualsiasi utente autenticato con
 *   email verificata può inviare bug/suggerimenti + valutazione a stelle.
 *   Anti-spam: massimo 5 invii al giorno per utente.
 * - feedbackAdminRouter (/api/admin/feedback): solo proprietario app
 *   (APP_OWNER_EMAILS, email riletta dal DB). NON dipende dal flag
 *   ENABLE_TEST_ANALYTICS: il feedback resta attivo per tutta la fase test.
 */

async function requireAppOwner(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Token di autenticazione mancante' } });
    }
    const [record] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);
    if (!record) {
      return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'Utente non trovato' } });
    }
    if (!record.emailVerified || !isAppOwner(record.email)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: "Accesso riservato al proprietario dell'app" } });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore durante la verifica dei permessi' } });
  }
}

const feedbackSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'other']),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(2, 'Messaggio troppo corto').max(2000),
  platform: z.string().trim().max(10).optional(),
  appVersion: z.string().trim().max(20).optional(),
});

export const feedbackRouter = Router();

feedbackRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Dati non validi' } });
    }
    const userId = req.user!.userId;

    // Anti-spam: max 12 feedback nelle ultime 24 ore per utente
    // (il modulo può inviare fino a 3 voci per volta).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ n: count() })
      .from(feedbackEntries)
      .where(and(eq(feedbackEntries.userId, userId), gte(feedbackEntries.createdAt, since)));
    if ((row?.n ?? 0) >= 12) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Hai già inviato molti feedback nelle ultime 24 ore. Riprova più tardi, grazie!' } });
    }

    const { category, rating, message, platform, appVersion } = parsed.data;
    await db.insert(feedbackEntries).values({
      userId,
      category,
      rating: rating ?? null,
      message,
      platform: platform || null,
      appVersion: appVersion || null,
    });
    res.status(201).json({ ok: true });

    // Notifica il proprietario via email (fire-and-forget: non deve mai
    // bloccare né far fallire il salvataggio del feedback appena confermato).
    void (async () => {
      const [author] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      await sendFeedbackNotificationEmail({
        userName: author?.name ?? 'Tester',
        userEmail: author?.email ?? 'sconosciuto',
        category,
        rating: rating ?? null,
        message,
        platform: platform || null,
        appVersion: appVersion || null,
      });
    })().catch((error) => {
      logger.error('Feedback notification email failed', { error: String(error) });
    });
  } catch (error) {
    logger.error('Feedback insert error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Impossibile salvare il feedback' } });
  }
});

export const feedbackAdminRouter = Router();

// GET /api/admin/feedback/access — il client mostra la voce di menu solo se 200.
feedbackAdminRouter.get('/access', requireAppOwner, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/admin/feedback?limit=100 — elenco feedback (più recenti prima) + riepilogo.
feedbackAdminRouter.get('/', requireAppOwner, async (req: Request, res: Response) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 200;

    const entries = await db
      .select({
        id: feedbackEntries.id,
        category: feedbackEntries.category,
        rating: feedbackEntries.rating,
        message: feedbackEntries.message,
        platform: feedbackEntries.platform,
        appVersion: feedbackEntries.appVersion,
        createdAt: feedbackEntries.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(feedbackEntries)
      .innerJoin(users, eq(users.id, feedbackEntries.userId))
      .orderBy(desc(feedbackEntries.createdAt))
      .limit(limit);

    const [summary] = await db
      .select({
        total: count(),
        avgRating: sql<string | null>`round(avg(${feedbackEntries.rating})::numeric, 2)`,
        bugs: sql<number>`count(*) filter (where ${feedbackEntries.category} = 'bug')`,
        suggestions: sql<number>`count(*) filter (where ${feedbackEntries.category} = 'suggestion')`,
      })
      .from(feedbackEntries);

    res.json({ entries, summary });
  } catch (error) {
    logger.error('Feedback list error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Impossibile caricare i feedback' } });
  }
});
