import { logger } from './logger';
import { runBillPushTick } from './bill-push';
import { runEventPushTick } from './event-push';

/**
 * Scheduler unico dei promemoria push (bollette + eventi): un controllo al
 * minuto. Ogni "tick" trova i promemoria arrivati al loro orario e li invia
 * a tutti i membri della famiglia (vedi bill-push.ts / event-push.ts per le
 * regole e l'anti-doppione).
 */

const TICK_INTERVAL_MS = 60 * 1000;

let tickRunning = false;
let schedulerStarted = false;

/** Avvia lo scheduler. Idempotente. */
export function startPushScheduler(intervalMs: number = TICK_INTERVAL_MS): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const now = new Date();
      const bills = await runBillPushTick(now);
      const events = await runEventPushTick(now);
      if (bills > 0 || events > 0) {
        logger.info('Push scheduler: promemoria inviati', { bills, events });
      }
    } catch (error) {
      logger.error('Push scheduler tick fallito', { error: String(error) });
    } finally {
      tickRunning = false;
    }
  };

  // Non tenere vivo il processo solo per lo scheduler (unref esiste in Node).
  const timer = setInterval(tick, intervalMs) as unknown as { unref?: () => void };
  timer.unref?.();
  void tick();
}
