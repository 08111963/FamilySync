import { Router } from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';
import { normalizeEventTimes } from '../lib/normalize-event-times';

/**
 * Endpoint di manutenzione dati token-gated (pattern db-dev-prod-migration):
 * l'unico canale di SCRITTURA verso il DB di produzione è l'app pubblicata.
 *
 * Gate: 404 se MIGRATE_TOKEN non è impostato nell'ambiente; richiede header
 * x-migrate-token identico. Dopo l'uso in prod, eliminare la env var
 * MIGRATE_TOKEN dal deployment per disattivare l'endpoint.
 */
const router = Router();

function isAuthorized(req: Request): boolean {
  const expected = process.env.MIGRATE_TOKEN;
  if (!expected) return false;
  const provided = req.header('x-migrate-token') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Ripara gli orari malformati (es. time='15') nei vecchi eventi calendario.
 * Idempotente: può essere invocato più volte senza effetti collaterali.
 */
router.post('/normalize-event-times', async (req: Request, res: Response) => {
  if (!process.env.MIGRATE_TOKEN) return res.status(404).send('Not found');
  if (!isAuthorized(req)) return res.status(404).send('Not found');
  try {
    const result = await normalizeEventTimes(db);
    logger.info('Maintenance normalize-event-times executed', { ...result });
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error('Maintenance normalize-event-times failed', { error: String(error) });
    res.status(500).json({ ok: false });
  }
});

/**
 * Applica in produzione il vincolo CHECK sul formato orari degli eventi
 * (migrazione 0026): prima ripara le righe malformate (idempotente), poi
 * aggiunge i constraint. Ripetibile senza effetti collaterali.
 */
router.post('/apply-event-time-constraint', async (req: Request, res: Response) => {
  if (!process.env.MIGRATE_TOKEN) return res.status(404).send('Not found');
  if (!isAuthorized(req)) return res.status(404).send('Not found');
  try {
    // 1) Bonifica: senza di questa l'ALTER fallirebbe se esistono righe storiche malformate.
    const repaired = await normalizeEventTimes(db);
    // 2) Constraint (DROP+ADD = idempotente).
    await db.execute(sql`ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_time_format_check"`);
    await db.execute(sql`ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_time_format_check" CHECK ("time" IS NULL OR "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`);
    await db.execute(sql`ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_end_time_format_check"`);
    await db.execute(sql`ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_end_time_format_check" CHECK ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`);
    logger.info('Maintenance apply-event-time-constraint executed', { ...repaired });
    res.json({ ok: true, repaired });
  } catch (error) {
    logger.error('Maintenance apply-event-time-constraint failed', { error: String(error) });
    res.status(500).json({ ok: false });
  }
});

export default router;
