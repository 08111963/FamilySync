/**
 * Alert automatico sui CLIENT_CRASH ripetuti.
 *
 * Perché: i crash del bundle web sui browser in-app (WhatsApp/Gmail/Instagram)
 * arrivano come report all'endpoint pubblico /api/client-errors e finiscono
 * solo nei log. Se un nuovo metodo JS moderno non coperto dal polyfill
 * (lib/runtime-polyfills.ts) torna a rompere quei WebView datati, senza un
 * avviso ce ne si accorge solo controllando manualmente i log.
 *
 * Come funziona:
 * - finestra scorrevole PERSISTITA su DB (tabella client_crash_reports): ogni
 *   report inserisce una riga già sanificata (message, url, userAgent,
 *   platform) e pota le righe fuori finestra;
 * - quando nella finestra ci sono >= CLIENT_CRASH_ALERT_THRESHOLD report,
 *   viene inviata UNA email al proprietario (APP_OWNER_EMAILS) con i campioni
 *   più recenti, così l'url e il messaggio d'errore identificano subito il
 *   metodo mancante;
 * - cooldown per non inondare la casella se i crash continuano: il "quando è
 *   partito l'ultimo alert" vive in scheduled_job_runs con claim atomico
 *   (claimScheduledJobRun), quindi con più istanze concorrenti UNA sola vince
 *   il diritto di inviare l'email; se l'invio fallisce del tutto il claim
 *   viene rilasciato e il prossimo report ritenta.
 *
 * Config via env (tutte opzionali):
 * - CLIENT_CRASH_ALERT_THRESHOLD       (default 3, 0/negativo = disattivato)
 * - CLIENT_CRASH_ALERT_WINDOW_MINUTES  (default 15)
 * - CLIENT_CRASH_ALERT_COOLDOWN_MINUTES (default 60)
 *
 * Sicurezza: conteggio e cooldown sopravvivono a riavvii e a più istanze;
 * se il DB non è raggiungibile si logga e basta (l'endpoint pubblico deve
 * sempre rispondere 204, mai propagare errori al client).
 */
import { desc, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { clientCrashReports } from "../../shared/schema";
import { logger, redactForLog } from "./logger";
import { sendClientCrashAlertEmail } from "./email";
import { claimScheduledJobRun, releaseScheduledJobRun } from "./scheduled-jobs";

/**
 * Sanitizza un campione di crash prima di metterlo in un'email: l'URL può
 * contenere token/codici OAuth/reset in query o fragment (l'ErrorBoundary
 * manda window.location.href intero), quindi teniamo SOLO origin+path.
 * Messaggio e user agent passano dalla stessa redazione dei log di
 * produzione (email, JWT, token opachi, coppie chiave=valore sensibili).
 */
// Route che portano capability token direttamente nel PATH (non solo in
// query): tutto ciò che segue questi segmenti va mascherato.
const TOKEN_PATH_SEGMENTS = new Set([
  "reset-password",
  "verify-email",
  "join",
  "join-link",
]);

/** Maschera i segmenti di path successivi a una route tokenizzata. */
function sanitizePath(path: string): string {
  const parts = path.split("/");
  let masking = false;
  const out = parts.map((seg) => {
    if (masking && seg !== "") return "[REDACTED]";
    if (TOKEN_PATH_SEGMENTS.has(seg.toLowerCase())) masking = true;
    return seg;
  });
  // redactForLog copre anche eventuali token lunghi in path non previsti.
  return redactForLog(out.join("/"));
}

export function sanitizeCrashSample(sample: CrashSample): CrashSample {
  let url: string | undefined;
  if (sample.url) {
    try {
      const u = new URL(sample.url);
      url = `${u.origin}${sanitizePath(u.pathname)}`;
    } catch {
      // URL relativo o malformato: butta via tutto da '?' o '#' in poi
      // e maschera comunque i segmenti tokenizzati del path.
      url = sanitizePath(sample.url.split(/[?#]/)[0]);
    }
  }
  return {
    message: redactForLog(sample.message),
    url,
    userAgent: sample.userAgent ? redactForLog(sample.userAgent) : undefined,
    platform: sample.platform ? redactForLog(sample.platform) : undefined,
  };
}

export interface CrashSample {
  message: string;
  url?: string;
  userAgent?: string;
  platform?: string;
}

const MAX_SAMPLES_IN_EMAIL = 5;

/** Nome del "job" in scheduled_job_runs usato come cooldown durevole. */
export const CLIENT_CRASH_ALERT_JOB_NAME = "client_crash_alert";

/** Tetto di righe conservate nella finestra (limita la crescita del DB). */
const MAX_STORED_REPORTS = 200;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getClientCrashAlertConfig() {
  return {
    threshold: intFromEnv("CLIENT_CRASH_ALERT_THRESHOLD", 3),
    windowMs: intFromEnv("CLIENT_CRASH_ALERT_WINDOW_MINUTES", 15) * 60 * 1000,
    cooldownMs:
      intFromEnv("CLIENT_CRASH_ALERT_COOLDOWN_MINUTES", 60) * 60 * 1000,
  };
}

/** Solo per i test: azzera finestra persistita e cooldown su DB. */
export async function resetClientCrashAlertState(): Promise<void> {
  await db.delete(clientCrashReports);
  await db.execute(
    sql`DELETE FROM scheduled_job_runs WHERE job_name = ${CLIENT_CRASH_ALERT_JOB_NAME}`,
  );
}

/**
 * Registra un report di crash su DB e, se la soglia nella finestra è
 * raggiunta e il cooldown (persistito, claim atomico) è scaduto, invia
 * l'alert al proprietario. Best-effort: qualunque errore (DB o email) viene
 * solo loggato, mai propagato al chiamante (l'endpoint pubblico deve sempre
 * rispondere 204). Conteggio e cooldown sopravvivono a riavvii e più istanze;
 * il claim atomico garantisce che una sola istanza invii l'email.
 *
 * Ritorna true se questo report ha fatto scattare un alert (utile nei test).
 */
export async function recordClientCrash(
  sample: CrashSample,
  now = Date.now(),
): Promise<boolean> {
  const { threshold, windowMs, cooldownMs } = getClientCrashAlertConfig();
  if (threshold <= 0) return false;

  try {
    // Sanitizza SUBITO: su DB (e poi nell'email) non devono mai finire
    // query string con token/codici né messaggi con segreti in chiaro.
    const clean = sanitizeCrashSample(sample);
    const nowDate = new Date(now);
    const cutoff = new Date(now - windowMs);

    await db.insert(clientCrashReports).values({
      message: clean.message.slice(0, 1000),
      url: clean.url?.slice(0, 500),
      userAgent: clean.userAgent?.slice(0, 500),
      platform: clean.platform?.slice(0, 50),
      at: nowDate,
    });
    // Pota la finestra e applica il tetto (tiene le righe più recenti).
    await db.delete(clientCrashReports).where(lt(clientCrashReports.at, cutoff));
    await db.execute(sql`
      DELETE FROM client_crash_reports
      WHERE id IN (
        SELECT id FROM client_crash_reports
        ORDER BY at DESC, id
        OFFSET ${MAX_STORED_REPORTS}
      )
    `);

    const recent = await db
      .select()
      .from(clientCrashReports)
      .where(gte(clientCrashReports.at, cutoff))
      .orderBy(desc(clientCrashReports.at));

    if (recent.length < threshold) return false;

    // Cooldown durevole con claim atomico: con più istanze concorrenti solo
    // una vince il diritto di inviare l'email (le altre vedono false).
    const claimed = await claimScheduledJobRun(
      CLIENT_CRASH_ALERT_JOB_NAME,
      cooldownMs,
      nowDate,
    );
    if (!claimed) return false;

    const samples = recent
      .slice(0, MAX_SAMPLES_IN_EMAIL)
      .reverse()
      .map((c) => ({
        message: c.message,
        url: c.url ?? undefined,
        userAgent: c.userAgent ?? undefined,
        platform: c.platform ?? undefined,
        at: c.at.toISOString(),
      }));

    try {
      await sendClientCrashAlertEmail({
        count: recent.length,
        windowMinutes: Math.round(windowMs / 60000),
        samples,
      });
    } catch (err) {
      // Invio fallito: rilascia il claim così il PROSSIMO report ritenta
      // (altrimenti l'alert andrebbe perso per l'intero cooldown).
      logger.error("CLIENT_CRASH alert email failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      await releaseScheduledJobRun(CLIENT_CRASH_ALERT_JOB_NAME, cooldownMs);
      return false;
    }

    return true;
  } catch (err) {
    logger.error("CLIENT_CRASH alert persistence failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
