import { sql } from 'drizzle-orm';
import type { db as Db } from '../db';
import { logger } from './logger';
import { normalizeTimeOfDay } from '../../shared/chore-recurrence';

export interface NormalizeEventTimesResult {
  scanned: number;
  updated: number;
  /** Eventi il cui orario di inizio era irrecuperabile: time azzerato (diventano "tutto il giorno"). */
  clearedStart: number;
  /** Eventi il cui orario di fine era irrecuperabile: end_time azzerato. */
  clearedEnd: number;
}

/**
 * Ripara gli orari malformati salvati nei vecchi eventi (es. time='15',
 * end_time='16', senza minuti) precedenti all'introduzione della validazione.
 * Idempotente: le righe già in formato HH:MM non vengono toccate.
 *
 * - Valore recuperabile ("15", "9:30", "15.30") → normalizzato a "HH:MM".
 * - Valore irrecuperabile → azzerato (l'evento ricade nel percorso all-day,
 *   come già fanno in modo difensivo il payload Google e il feed ICS).
 */
const CANONICAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Trasformazione pura di una riga: calcola i nuovi valori time/end_time.
 * - Valore recuperabile → normalizzato a HH:MM.
 * - Valore irrecuperabile → null (clearedStart/clearedEnd true).
 * - Se l'inizio è nullo, anche end_time viene azzerato (non ha senso da solo).
 */
export function normalizeEventTimeFields(row: { time: string | null; endTime: string | null }): {
  time: string | null;
  endTime: string | null;
  changed: boolean;
  clearedStart: boolean;
  clearedEnd: boolean;
} {
  let newTime = row.time;
  let newEnd = row.endTime;
  let clearedStart = false;
  let clearedEnd = false;

  if (row.time !== null && !CANONICAL_TIME.test(row.time)) {
    newTime = normalizeTimeOfDay(row.time);
    if (newTime === null) clearedStart = true;
  }
  if (row.endTime !== null && !CANONICAL_TIME.test(row.endTime)) {
    newEnd = normalizeTimeOfDay(row.endTime);
    if (newEnd === null) clearedEnd = true;
  }
  // Senza orario di inizio l'end_time da solo non ha senso.
  if (newTime === null) newEnd = null;

  return {
    time: newTime,
    endTime: newEnd,
    changed: newTime !== row.time || newEnd !== row.endTime,
    clearedStart,
    clearedEnd,
  };
}

export async function normalizeEventTimes(db: typeof Db): Promise<NormalizeEventTimesResult> {
  const result: NormalizeEventTimesResult = { scanned: 0, updated: 0, clearedStart: 0, clearedEnd: 0 };

  // Solo le righe con orario presente ma NON già in formato HH:MM canonico.
  const rows = await db.execute<{ id: string; time: string | null; end_time: string | null }>(sql`
    SELECT id, time, end_time
    FROM calendar_events
    WHERE (time IS NOT NULL AND time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       OR (end_time IS NOT NULL AND end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  `);

  for (const row of rows.rows) {
    result.scanned++;
    const next = normalizeEventTimeFields({ time: row.time, endTime: row.end_time });
    if (next.clearedStart) result.clearedStart++;
    if (next.clearedEnd) result.clearedEnd++;

    if (next.changed) {
      await db.execute(sql`
        UPDATE calendar_events
        SET time = ${next.time}, end_time = ${next.endTime}
        WHERE id = ${row.id}
      `);
      result.updated++;
      logger.info('Normalized malformed event time', {
        eventId: row.id,
        from: { time: row.time, endTime: row.end_time },
        to: { time: next.time, endTime: next.endTime },
      });
    }
  }

  return result;
}
