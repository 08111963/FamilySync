/**
 * Ripara gli orari malformati (es. time='15' senza minuti) nei vecchi eventi
 * del calendario, normalizzandoli a HH:MM. Idempotente, riutilizzabile.
 *
 * Uso:  npx tsx scripts/normalize-event-times.ts
 *
 * NOTA: agisce sul DATABASE_URL corrente (dev). Per la produzione usare
 * l'endpoint applicativo token-gated POST /api/_maintenance/normalize-event-times
 * (vedi server/routes/maintenance.ts e memoria db-dev-prod-migration.md).
 */
import { db } from '../server/db';
import { normalizeEventTimes } from '../server/lib/normalize-event-times';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL non impostata');
  const result = await normalizeEventTimes(db);
  console.log('Normalizzazione orari eventi completata:', result);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Normalizzazione fallita:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
