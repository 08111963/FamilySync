import * as crypto from "crypto";
import { inspect } from "util";

export function generateRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

const IS_PROD = process.env.NODE_ENV === "production";

// --- Redazione log di produzione (GDPR / information disclosure) ---
// In produzione i log finiscono su stdout e vengono raccolti dalla piattaforma:
// non devono mai contenere email in chiaro, token, JWT o credenziali.
const MAX_LOG_LEN = 8000; // limite anti-regex-patologiche e anti-log giganti
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;
const AUTH_HEADER_RE = /((?:bearer|basic)\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const HEX_TOKEN_RE = /\b[a-fA-F0-9]{32,}\b/g;
const OPAQUE_TOKEN_RE = /\b[A-Za-z0-9_-]{40,}\b/g;
// "token":"..." e varianti JSON
const KEYVAL_SECRET_RE =
  /("(?:token|access_token|refresh_token|id_token|password|secret|authorization|apiKey|api_key)"\s*:\s*")[^"]+(")/gi;
// token=... in URL/query/form (access_token=..., code=..., ecc.)
const URLPARAM_SECRET_RE =
  /\b((?:access_token|refresh_token|id_token|token|code|password|secret|api_key|apikey)=)[^&\s"']+/gi;

export function redactForLog(input: string): string {
  let s = input;
  if (s.length > MAX_LOG_LEN) s = s.slice(0, MAX_LOG_LEN) + "…[TRONCATO]";
  return s
    .replace(KEYVAL_SECRET_RE, "$1[REDACTED]$2")
    .replace(URLPARAM_SECRET_RE, "$1[REDACTED]")
    .replace(JWT_RE, "[REDACTED_JWT]")
    .replace(AUTH_HEADER_RE, "$1[REDACTED]")
    .replace(EMAIL_RE, "$1***@$2")
    .replace(HEX_TOKEN_RE, "[REDACTED_TOKEN]")
    .replace(OPAQUE_TOKEN_RE, "[REDACTED_TOKEN]");
}

function redactArg(arg: unknown): unknown {
  try {
    if (typeof arg === "string") return redactForLog(arg);
    if (arg instanceof Error) return redactForLog(arg.stack || String(arg));
    if (arg && typeof arg === "object") {
      // util.inspect gestisce cicli, BigInt e toJSON che lanciano: mai
      // ripiegare sull'oggetto originale non redatto.
      return redactForLog(inspect(arg, { depth: 4, maxStringLength: MAX_LOG_LEN }));
    }
    return arg;
  } catch {
    return "[UNLOGGABLE]";
  }
}

// In produzione TUTTO ciò che passa da console.* viene redatto, inclusi i
// console.log/console.error diretti sparsi nel codice (stack trace comprese).
if (IS_PROD) {
  for (const method of ["log", "warn", "error", "info", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => original(...args.map(redactArg));
  }
}

type LogLevel = "info" | "warn" | "error" | "debug";

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  // La redazione in produzione avviene nel patch di console.* qui sopra.
  return `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(formatLog("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatLog("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(formatLog("error", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "development") {
      console.log(formatLog("debug", message, meta));
    }
  },
};
