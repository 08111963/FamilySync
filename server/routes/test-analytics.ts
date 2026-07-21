import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { testAnalyticsEvents, users } from '../../shared/schema';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DEMO_EMAIL } from '../lib/demo-account';
import {
  ALLOWED_EVENTS,
  isAppOwner,
  isTestAnalyticsEnabled,
  pruneOldEvents,
  sanitizeMetadata,
  sanitizePlatform,
} from '../lib/test-analytics';

/**
 * ANALYTICS INTERNA TEMPORANEA (solo periodo di test).
 *
 * - eventsRouter: POST /api/test-analytics/events (utenti autenticati; salva
 *   eventi tecnici minimi, MAI contenuti personali).
 * - adminRouter: /api/admin/test-analytics/* (solo proprietario app via
 *   APP_OWNER_EMAILS + email verificata + flag attivo).
 *
 * Con ENABLE_TEST_ANALYTICS assente/false TUTTI gli endpoint rispondono 404:
 * nessun evento viene salvato e il pannello non è raggiungibile.
 */

export function requireTestAnalyticsFlag(req: Request, res: Response, next: NextFunction) {
  if (!isTestAnalyticsEnabled()) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Non trovato' } });
  }
  next();
}

async function requireAppOwner(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Token di autenticazione mancante' } });
    }
    // Email sempre riletta dal DB (il token potrebbe essere datato) + verifica email.
    const [record] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);
    if (!record) {
      return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'Utente non trovato' } });
    }
    if (!record.emailVerified || !isAppOwner(record.email)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Accesso riservato al proprietario dell\'app' } });
    }
    next();
  } catch {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore durante la verifica dei permessi' } });
  }
}

const eventSchema = z.object({
  eventName: z.string().min(1).max(50),
  platform: z.unknown().optional(),
  appVersion: z.string().max(20).optional(),
  screen: z.string().max(100).optional(),
  familyId: z.string().uuid().optional(),
  metadata: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Router eventi (utente autenticato qualsiasi)
// ---------------------------------------------------------------------------
export const testAnalyticsEventsRouter = Router();

testAnalyticsEventsRouter.post('/events', requireTestAnalyticsFlag, async (req: Request, res: Response) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success || !ALLOWED_EVENTS.has(parsed.data.eventName)) {
      return res.status(400).json({ error: { code: 'INVALID_EVENT', message: 'Evento non valido' } });
    }
    const data = parsed.data;

    await db.insert(testAnalyticsEvents).values({
      eventName: data.eventName,
      userId: req.user?.userId ?? null,
      familyId: data.familyId ?? null,
      platform: sanitizePlatform(data.platform),
      appVersion: data.appVersion?.slice(0, 20) ?? null,
      screen: data.screen?.slice(0, 100) ?? null,
      metadata: sanitizeMetadata(data.metadata),
      isDemoAccount: (req.user?.email ?? '').toLowerCase() === DEMO_EMAIL.toLowerCase(),
    });

    // Retention: pulizia opportunistica (~2% delle richieste) degli eventi >30 giorni.
    if (Math.random() < 0.02) {
      pruneOldEvents().catch(() => {});
    }

    return res.status(201).json({ ok: true });
  } catch {
    // Gli errori analytics non devono mai propagarsi come 500 "rumorosi" lato app.
    return res.status(200).json({ ok: false });
  }
});

// ---------------------------------------------------------------------------
// Router admin (solo proprietario app)
// ---------------------------------------------------------------------------
export const testAnalyticsAdminRouter = Router();

testAnalyticsAdminRouter.use(requireTestAnalyticsFlag, requireAppOwner);

function periodStart(req: Request): Date {
  const period = typeof req.query.period === 'string' ? req.query.period : '7d';
  const days = period === 'today' ? 1 : period === '30d' ? 30 : 7;
  if (period === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Check di accesso leggero: usato dall'app per decidere se mostrare la voce.
testAnalyticsAdminRouter.get('/access', (_req: Request, res: Response) => {
  res.json({ allowed: true });
});

testAnalyticsAdminRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    await pruneOldEvents();
    const since = periodStart(req);
    const where = gte(testAnalyticsEvents.createdAt, since);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      [totals],
      [activeToday],
      [appOpens],
      topScreens,
      topFeatures,
      byPlatform,
      byEvent,
      recentErrors,
      [lastEvent],
      [demoUsage],
    ] = await Promise.all([
      db.select({ total: count() }).from(testAnalyticsEvents).where(where),
      db.select({ n: sql<number>`count(distinct ${testAnalyticsEvents.userId})` })
        .from(testAnalyticsEvents)
        .where(gte(testAnalyticsEvents.createdAt, todayStart)),
      db.select({ n: count() }).from(testAnalyticsEvents)
        .where(and(where, eq(testAnalyticsEvents.eventName, 'app_open'))),
      db.select({ screen: testAnalyticsEvents.screen, n: count() })
        .from(testAnalyticsEvents)
        .where(and(where, eq(testAnalyticsEvents.eventName, 'screen_view')))
        .groupBy(testAnalyticsEvents.screen)
        .orderBy(desc(count()))
        .limit(10),
      db.select({ feature: sql<string>`${testAnalyticsEvents.metadata}->>'feature'`, n: count() })
        .from(testAnalyticsEvents)
        .where(and(where, eq(testAnalyticsEvents.eventName, 'feature_used')))
        .groupBy(sql`${testAnalyticsEvents.metadata}->>'feature'`)
        .orderBy(desc(count()))
        .limit(10),
      db.select({ platform: testAnalyticsEvents.platform, n: count() })
        .from(testAnalyticsEvents)
        .where(where)
        .groupBy(testAnalyticsEvents.platform)
        .orderBy(desc(count())),
      db.select({ eventName: testAnalyticsEvents.eventName, n: count() })
        .from(testAnalyticsEvents)
        .where(where)
        .groupBy(testAnalyticsEvents.eventName)
        .orderBy(desc(count())),
      db.select()
        .from(testAnalyticsEvents)
        .where(and(where, eq(testAnalyticsEvents.eventName, 'api_error')))
        .orderBy(desc(testAnalyticsEvents.createdAt))
        .limit(20),
      db.select()
        .from(testAnalyticsEvents)
        .orderBy(desc(testAnalyticsEvents.createdAt))
        .limit(1),
      db.select({ n: count() }).from(testAnalyticsEvents)
        .where(and(where, eq(testAnalyticsEvents.isDemoAccount, true))),
    ]);

    res.json({
      period: typeof req.query.period === 'string' ? req.query.period : '7d',
      totalEvents: totals?.total ?? 0,
      activeUsersToday: Number(activeToday?.n ?? 0),
      appOpens: appOpens?.n ?? 0,
      topScreens,
      topFeatures,
      byPlatform,
      byEvent,
      recentErrors,
      lastEvent: lastEvent ?? null,
      demoAccountEvents: demoUsage?.n ?? 0,
      appVersions: await db
        .select({ appVersion: testAnalyticsEvents.appVersion, n: count() })
        .from(testAnalyticsEvents)
        .where(where)
        .groupBy(testAnalyticsEvents.appVersion)
        .orderBy(desc(count())),
    });
  } catch {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel calcolo del riepilogo' } });
  }
});

testAnalyticsAdminRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const since = periodStart(req);
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const eventName = typeof req.query.eventName === 'string' && ALLOWED_EVENTS.has(req.query.eventName)
      ? req.query.eventName
      : null;

    const where = eventName
      ? and(gte(testAnalyticsEvents.createdAt, since), eq(testAnalyticsEvents.eventName, eventName))
      : gte(testAnalyticsEvents.createdAt, since);

    const events = await db.select()
      .from(testAnalyticsEvents)
      .where(where)
      .orderBy(desc(testAnalyticsEvents.createdAt))
      .limit(limit);

    res.json({ events });
  } catch {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero degli eventi' } });
  }
});

testAnalyticsAdminRouter.delete('/', async (_req: Request, res: Response) => {
  try {
    await db.delete(testAnalyticsEvents);
    res.json({ ok: true, message: 'Analytics di test svuotate' });
  } catch {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore durante la cancellazione' } });
  }
});
