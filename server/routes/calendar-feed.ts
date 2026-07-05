import { Router } from 'express';
import type { Request, Response } from 'express';
import { getParam } from '../lib/http-params';
import { db } from '../db';
import { calendarEvents, families } from '../../shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { logger } from '../lib/logger';

/**
 * Feed ICS pubblico del calendario famiglia.
 * L'URL contiene un token segreto (non indovinabile) legato alla famiglia:
 * chiunque abbia il link puo' leggere gli eventi, quindi il token e'
 * rigenerabile dall'app se serve revocare l'accesso.
 */
const router = Router();

/** Escape testo per ICS (RFC 5545): backslash, punto e virgola, virgola, newline. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Piega le righe oltre 75 ottetti come richiesto dallo standard ICS. */
function foldLine(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

/** "YYYY-MM-DD" -> "YYYYMMDD" */
function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

/** "YYYY-MM-DD" + "HH:mm" -> "YYYYMMDDTHHmm00" (ora locale "floating"). */
function icsDateTime(date: string, time: string): string {
  return `${icsDate(date)}T${time.replace(':', '')}00`;
}

/** Giorno successivo in formato YYYY-MM-DD. */
export function nextDayIso(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Giorno successivo in formato YYYYMMDD (per DTEND degli eventi tutto il giorno). */
function nextDay(date: string): string {
  return icsDate(nextDayIso(date));
}

/** Aggiunge un'ora a "HH:mm" (con wrap oltre mezzanotte). */
export function plusOneHour(time: string): string {
  const [h = 0, m = 0] = time.split(':').map((n) => parseInt(n, 10));
  const total = (h * 60 + m + 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Calcola data e ora di fine di un evento con orario.
 * Se la fine risulta "prima o uguale" all'inizio (endTime esplicito prima
 * dell'inizio, oppure +1h di default che scavalca la mezzanotte, es. 23:30),
 * la fine passa al giorno successivo: DTEND non deve mai precedere DTSTART.
 */
export function computeTimedEnd(
  date: string,
  time: string,
  endTime?: string | null
): { endDate: string; endTime: string } {
  const end = endTime || plusOneHour(time);
  const endDate = end <= time ? nextDayIso(date) : date;
  return { endDate, endTime: end };
}

router.get('/:token', async (req: Request, res: Response) => {
  try {
    // Accetta sia /calendar-feed/<token> che /calendar-feed/<token>.ics
    const raw = getParam(req, 'token');
    const token = raw.endsWith('.ics') ? raw.slice(0, -4) : raw;

    if (!token || token.length < 32 || !/^[a-f0-9]+$/i.test(token)) {
      return res.status(404).send('Not found');
    }

    const [family] = await db
      .select({ id: families.id, name: families.name })
      .from(families)
      .where(eq(families.icsFeedToken, token))
      .limit(1);

    if (!family) {
      return res.status(404).send('Not found');
    }

    // Eventi dagli ultimi 90 giorni in avanti (i client sincronizzano periodicamente)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90);
    const fromStr = fromDate.toISOString().slice(0, 10);

    const events = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.familyId, family.id), gte(calendarEvents.date, fromStr)));

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FamilySync//Calendario Famiglia//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      foldLine(`X-WR-CALNAME:${icsEscape(`FamilySync - ${family.name}`)}`),
      'X-WR-TIMEZONE:Europe/Rome',
    ];

    for (const ev of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:${ev.id}@familysync`));
      const stamp = (ev.updatedAt ?? ev.createdAt ?? new Date())
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      lines.push(`DTSTAMP:${stamp}`);

      if (ev.allDay || !ev.time) {
        lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`);
        lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
      } else {
        lines.push(`DTSTART;TZID=Europe/Rome:${icsDateTime(ev.date, ev.time)}`);
        const end = computeTimedEnd(ev.date, ev.time, ev.endTime);
        lines.push(`DTEND;TZID=Europe/Rome:${icsDateTime(end.endDate, end.endTime)}`);
      }

      lines.push(foldLine(`SUMMARY:${icsEscape(ev.title)}`));
      if (ev.description) lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`));
      if (ev.location) lines.push(foldLine(`LOCATION:${icsEscape(ev.location)}`));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="familysync.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(lines.join('\r\n') + '\r\n');
  } catch (error) {
    logger.error('Calendar feed error', { error: String(error) });
    res.status(500).send('Server error');
  }
});

export default router;
