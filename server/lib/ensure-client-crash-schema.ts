import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Garantisce in modo idempotente la tabella client_crash_reports
 * (migrazione migrations/0028_client_crash_reports.sql).
 *
 * Perché serve: il DB di produzione è separato da quello di sviluppo e la
 * migrazione 0028 potrebbe non esservi mai stata applicata. Senza tabella,
 * ogni report POST /api/client-errors fallisce silenziosamente la
 * persistenza (viene solo loggato) e l'alert email al proprietario non
 * scatta mai. Eseguendo l'ensure all'avvio (come ensurePantryUniqueIndex),
 * il conteggio crash persistente si attiva da solo al primo boot dopo il
 * Publish, senza dipendere dalla sincronizzazione schema del deploy.
 */
export async function ensureClientCrashSchema(): Promise<{ created: boolean }> {
  const existing = await db.execute(sql`SELECT to_regclass('public.client_crash_reports') AS t`);
  if ((existing as any).rows?.[0]?.t) return { created: false };

  let created = false;
  await db.transaction(async (tx) => {
    // Serializza il bootstrap DDL tra istanze parallele (autoscale/reusePort).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('client_crash_reports_ddl'))`);
    const recheck = await tx.execute(sql`SELECT to_regclass('public.client_crash_reports') AS t`);
    if ((recheck as any).rows?.[0]?.t) return;
    // DDL identico a migrations/0028_client_crash_reports.sql.
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "client_crash_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "message" varchar(1000) NOT NULL,
        "url" varchar(500),
        "user_agent" varchar(500),
        "platform" varchar(50),
        "at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS "client_crash_reports_at_idx" ON "client_crash_reports" ("at")`);
    created = true;
  });
  return { created };
}
