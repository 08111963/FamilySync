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
 * - finestra scorrevole in-memory: ogni report registra timestamp + campioni
 *   (message, url, userAgent, platform);
 * - quando nella finestra arrivano >= CLIENT_CRASH_ALERT_THRESHOLD report,
 *   viene inviata UNA email al proprietario (APP_OWNER_EMAILS) con i campioni
 *   più recenti, così l'url e il messaggio d'errore identificano subito il
 *   metodo mancante;
 * - cooldown per non inondare la casella se i crash continuano.
 *
 * Config via env (tutte opzionali):
 * - CLIENT_CRASH_ALERT_THRESHOLD       (default 3, 0/negativo = disattivato)
 * - CLIENT_CRASH_ALERT_WINDOW_MINUTES  (default 15)
 * - CLIENT_CRASH_ALERT_COOLDOWN_MINUTES (default 60)
 *
 * Limiti noti: lo stato è in-memory, quindi un riavvio azzera la finestra e
 * più istanze contano separatamente. Accettabile: i crash da polyfill mancante
 * arrivano a raffica dallo stesso ErrorBoundary e superano comunque la soglia.
 */
import { logger, redactForLog } from "./logger";
import { sendClientCrashAlertEmail } from "./email";

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

interface CrashEntry extends CrashSample {
  at: number;
}

const MAX_SAMPLES_IN_EMAIL = 5;

let recentCrashes: CrashEntry[] = [];
let lastAlertAt = 0;

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

/** Solo per i test: azzera lo stato in-memory. */
export function resetClientCrashAlertState() {
  recentCrashes = [];
  lastAlertAt = 0;
}

/**
 * Registra un report di crash e, se la soglia nella finestra è raggiunta e
 * il cooldown è scaduto, invia l'alert al proprietario. L'invio email è
 * best-effort: gli errori vengono solo loggati, mai propagati al chiamante
 * (l'endpoint pubblico deve sempre rispondere 204).
 *
 * Ritorna true se questo report ha fatto scattare un alert (utile nei test).
 */
export function recordClientCrash(sample: CrashSample, now = Date.now()): boolean {
  const { threshold, windowMs, cooldownMs } = getClientCrashAlertConfig();
  if (threshold <= 0) return false;

  // Sanitizza SUBITO: in memoria (e poi nell'email) non devono mai finire
  // query string con token/codici né messaggi con segreti in chiaro.
  recentCrashes.push({ ...sanitizeCrashSample(sample), at: now });
  // Pota la finestra (e limita la memoria in ogni caso).
  const cutoff = now - windowMs;
  recentCrashes = recentCrashes.filter((c) => c.at >= cutoff).slice(-200);

  if (recentCrashes.length < threshold) return false;
  if (now - lastAlertAt < cooldownMs) return false;

  lastAlertAt = now;
  const count = recentCrashes.length;
  const samples = recentCrashes.slice(-MAX_SAMPLES_IN_EMAIL).map((c) => ({
    message: c.message,
    url: c.url,
    userAgent: c.userAgent,
    platform: c.platform,
    at: new Date(c.at).toISOString(),
  }));

  sendClientCrashAlertEmail({
    count,
    windowMinutes: Math.round(windowMs / 60000),
    samples,
  }).catch((err) => {
    logger.error("CLIENT_CRASH alert email failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return true;
}
