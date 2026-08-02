import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from './logger';

/**
 * Claim atomico e DUREVOLE per job periodici (tabella scheduled_job_runs).
 *
 * Su deployment autoscale l'istanza può spegnersi tra un tick e l'altro di un
 * setInterval in-process: il "quando è partito l'ultimo run" deve vivere nel
 * DB. Una sola istruzione SQL: INSERT se il job non è mai girato, altrimenti
 * UPDATE del last_run_at SOLO se è passato almeno `minIntervalMs`. Il
 * RETURNING dice se questa istanza ha vinto il claim: con più istanze
 * concorrenti solo una riceve la riga (Postgres serializza sul conflitto di
 * chiave primaria).
 */
export async function claimScheduledJobRun(
  jobName: string,
  minIntervalMs: number,
  now = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - minIntervalMs);
  const result = await db.execute(sql`
    INSERT INTO scheduled_job_runs (job_name, last_run_at)
    VALUES (${jobName}, ${now})
    ON CONFLICT (job_name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
    WHERE scheduled_job_runs.last_run_at <= ${cutoff}
    RETURNING job_name
  `);
  return (result.rows?.length ?? 0) > 0;
}

/**
 * Rilascia il claim se il run è fallito PRIMA di produrre effetti: arretra
 * last_run_at oltre la finestra così il prossimo tick (di questa o di
 * un'altra istanza) può riprovare subito invece di aspettare l'intervallo.
 * Best effort: se il rilascio fallisce, si riprova al giro successivo.
 */
export async function releaseScheduledJobRun(
  jobName: string,
  minIntervalMs: number,
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE scheduled_job_runs
      SET last_run_at = last_run_at - make_interval(secs => ${minIntervalMs / 1000 + 1})
      WHERE job_name = ${jobName}
    `);
  } catch (err) {
    logger.error('Scheduled job release failed', { jobName, error: String(err) });
  }
}

/**
 * Avvia uno scheduler durevole: un tick poco dopo il boot (catch-up dopo i
 * riavvii autoscale) e poi un poll periodico. Il lavoro vero parte solo se il
 * claim atomico riesce (è passata la finestra e nessun'altra istanza l'ha già
 * preso). Se `run` lancia, il claim viene rilasciato per ritentare al tick
 * successivo — sicuro qui perché i job promemoria hanno il PROPRIO dedup
 * per-elemento (bill_reminder_log / event_reminder_log): nessun doppio invio.
 */
export function startDurableScheduler(options: {
  jobName: string;
  /** Finestra minima tra due run (il claim fallisce prima). */
  minIntervalMs: number;
  /** Ogni quanto questa istanza tenta il claim. */
  pollIntervalMs: number;
  /** Ritardo del primo tentativo dopo il boot. */
  firstRunDelayMs: number;
  run: () => Promise<void>;
}): void {
  const { jobName, minIntervalMs, pollIntervalMs, firstRunDelayMs, run } = options;
  const tick = async () => {
    let claimed = false;
    try {
      claimed = await claimScheduledJobRun(jobName, minIntervalMs);
      if (!claimed) return;
      await run();
    } catch (err) {
      logger.error('Durable scheduler tick failed', { jobName, error: String(err) });
      if (claimed) await releaseScheduledJobRun(jobName, minIntervalMs);
    }
  };
  const first = setTimeout(() => void tick(), firstRunDelayMs) as unknown as { unref?: () => void };
  first.unref?.();
  const timer = setInterval(() => void tick(), pollIntervalMs) as unknown as { unref?: () => void };
  timer.unref?.();
}
