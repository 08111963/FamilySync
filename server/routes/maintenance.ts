import { Router } from 'express';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
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

export default router;
