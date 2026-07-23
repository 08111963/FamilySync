export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_RATE_LIMITED"
  | "AI_USAGE_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_BAD_RESPONSE"
  | "AI_PROVIDER_ERROR";

const USER_MESSAGES: Record<AiErrorCode, string> = {
  AI_NOT_CONFIGURED: "Le funzioni AI non sono al momento disponibili. Riprova più tardi.",
  AI_RATE_LIMITED: "Hai raggiunto il limite giornaliero per questa funzione AI. Riprova domani.",
  AI_USAGE_UNAVAILABLE: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova più tardi.",
  AI_TIMEOUT: "L'AI ci sta mettendo troppo tempo. Riprova tra poco.",
  AI_BAD_RESPONSE: "L'AI ha restituito una risposta non valida. Riprova.",
  AI_PROVIDER_ERROR: "Servizio AI temporaneamente non disponibile. Riprova tra poco.",
};

const HTTP_STATUS: Record<AiErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_RATE_LIMITED: 429,
  AI_USAGE_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_BAD_RESPONSE: 502,
  AI_PROVIDER_ERROR: 502,
};

export class AiError extends Error {
  code: AiErrorCode;
  httpStatus: number;
  userMessage: string;

  constructor(code: AiErrorCode, internalMessage?: string) {
    super(internalMessage || code);
    this.name = "AiError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.userMessage = USER_MESSAGES[code];
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}

/**
 * Risolve la chiave OpenAI da usare: preferisce OPENAI_API_KEY (account
 * personale) e ricade sull'integrazione Replit (AI_INTEGRATIONS_*).
 * Ritorna anche il baseURL da usare (solo per l'integrazione Replit).
 */
export function resolveOpenAiConfig(): { apiKey: string | undefined; baseURL: string | undefined } {
  const personalKey = process.env.OPENAI_API_KEY?.trim();
  if (personalKey) {
    // Chiave personale: sempre endpoint ufficiale OpenAI, mai il gateway Replit.
    return { apiKey: personalKey, baseURL: undefined };
  }
  return {
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || undefined,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || undefined,
  };
}

export function assertAiConfigured(): void {
  const { apiKey } = resolveOpenAiConfig();
  if (!apiKey) {
    throw new AiError("AI_NOT_CONFIGURED", "Nessuna chiave OpenAI configurata (OPENAI_API_KEY o AI_INTEGRATIONS_OPENAI_API_KEY)");
  }
}

/**
 * Mappa un errore generato dall'SDK OpenAI in un AiError tipizzato.
 * Non include mai segreti nel messaggio.
 */
export function mapOpenAiError(error: unknown): AiError {
  if (isAiError(error)) return error;

  const err = error as { status?: number; code?: string; name?: string; type?: string; message?: string };
  const status = typeof err?.status === "number" ? err.status : undefined;
  const name = err?.name || "";
  const code = err?.code || "";
  const type = err?.type || "";

  // Risposta non parsabile (JSON.parse fallito) o validazione fallita
  if (name === "SyntaxError" || name === "ZodError") {
    return new AiError("AI_BAD_RESPONSE", `OpenAI risposta non valida (${name})`);
  }

  // Timeout / abort
  if (
    name === "APITimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    /timed? ?out/i.test(err?.message || "")
  ) {
    return new AiError("AI_TIMEOUT", `OpenAI timeout (${name || code})`);
  }

  // Rate limit / quota
  if (status === 429 || code === "rate_limit_exceeded" || code === "insufficient_quota" || type === "insufficient_quota") {
    return new AiError("AI_RATE_LIMITED", `OpenAI rate limit (status ${status}, code ${code})`);
  }

  // Auth / config problems
  if (status === 401 || status === 403) {
    return new AiError("AI_NOT_CONFIGURED", `OpenAI auth error (status ${status})`);
  }

  // Network / connection
  if (name === "APIConnectionError" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return new AiError("AI_PROVIDER_ERROR", `OpenAI connection error (${name || code})`);
  }

  // Any other provider-side error
  return new AiError("AI_PROVIDER_ERROR", `OpenAI error (status ${status ?? "n/a"})`);
}
