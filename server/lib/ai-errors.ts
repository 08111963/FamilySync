export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_CREDITS_EXHAUSTED"
  | "AI_USAGE_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_BAD_RESPONSE"
  | "AI_CONSTRAINT_VIOLATION"
  | "AI_HEALTH_CONSENT_REQUIRED"
  | "AI_MODEL_CALL_BUDGET_EXHAUSTED"
  | "AI_PROVIDER_ERROR";

export type AiProvider = "openai_direct" | "replit_managed";

const USER_MESSAGES: Record<AiErrorCode, string> = {
  AI_NOT_CONFIGURED: "Le funzioni AI non sono al momento disponibili. Riprova più tardi.",
  AI_RATE_LIMITED: "Hai raggiunto il limite giornaliero per questa funzione AI. Riprova domani.",
  AI_PROVIDER_CREDITS_EXHAUSTED: "Le generazioni AI sono temporaneamente sospese perché il credito del servizio AI dell'app è esaurito. Riprova dopo il ripristino del credito.",
  AI_USAGE_UNAVAILABLE: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova più tardi.",
  AI_TIMEOUT: "L'AI ci sta mettendo troppo tempo. Riprova tra poco.",
  AI_BAD_RESPONSE: "La risposta dell'AI non era completa o nel formato previsto. Non è stato creato alcun piano: riprova.",
  AI_CONSTRAINT_VIOLATION: "Il risultato dell'AI non è compatibile con il profilo scelto. Non è stato creato alcun piano: riprova.",
  AI_HEALTH_CONSENT_REQUIRED: "Per usare le allergie nella generazione devi prima abilitare il consenso AI per i dati relativi alla salute.",
  AI_MODEL_CALL_BUDGET_EXHAUSTED: "Non è stato possibile completare un piano verificato entro il limite di elaborazione. Riprova tra poco.",
  AI_PROVIDER_ERROR: "Servizio AI temporaneamente non disponibile. Riprova tra poco.",
};

const HTTP_STATUS: Record<AiErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_RATE_LIMITED: 429,
  AI_PROVIDER_CREDITS_EXHAUSTED: 503,
  AI_USAGE_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_BAD_RESPONSE: 502,
  AI_CONSTRAINT_VIOLATION: 422,
  AI_HEALTH_CONSENT_REQUIRED: 403,
  AI_MODEL_CALL_BUDGET_EXHAUSTED: 503,
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
 * Elenca gli account autorizzati al pilot. Gli ID arrivano solo da una
 * variabile server-side e non devono mai essere scritti nel codice o nei log.
 */
function getOpenAiDirectPilotUserIds(): Set<string> {
  return new Set(
    (process.env.OPENAI_DIRECT_PILOT_USER_IDS || "")
      .split(",")
      .map((userId) => userId.trim())
      .filter(Boolean),
  );
}

/** Indica se l'utente autenticato è incluso nel pilot configurato lato server. */
export function isOpenAiDirectPilotUser(userId: string | undefined): boolean {
  return Boolean(userId && getOpenAiDirectPilotUserIds().has(userId));
}

/**
 * Il pilot usa esclusivamente una allowlist di user ID, mai il ruolo nella
 * famiglia. In assenza di allowlist o chiave diretta ogni richiesta resta sul
 * provider Replit Managed AI.
 */
export function resolveAiProviderForUserId(userId: string | undefined): AiProvider {
  return isOpenAiDirectPilotUser(userId) && Boolean(process.env.OPENAI_API_KEY?.trim())
    ? "openai_direct"
    : "replit_managed";
}

/**
 * Risolve una configurazione per provider esplicito. Non esiste alcun fallback
 * globale: l'assenza della chiave diretta non può spostare utenti o job verso
 * OpenAI personale. I chiamanti non presenti nella allowlist ricevono già il
 * fallback Replit tramite resolveAiProviderForUserId().
 */
export function resolveOpenAiConfig(provider: AiProvider = "replit_managed"): { apiKey: string | undefined; baseURL: string | undefined } {
  if (provider === "openai_direct") {
    return {
      apiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
      // Senza baseURL l'SDK usa esclusivamente l'endpoint ufficiale OpenAI.
      baseURL: undefined,
    };
  }
  return {
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || undefined,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || undefined,
  };
}

export function assertAiConfigured(provider: AiProvider = "replit_managed"): void {
  const { apiKey } = resolveOpenAiConfig(provider);
  if (!apiKey) {
    throw new AiError(
      "AI_NOT_CONFIGURED",
      provider === "openai_direct"
        ? "OPENAI_API_KEY non configurata"
        : "AI_INTEGRATIONS_OPENAI_API_KEY non configurata",
    );
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

  // Credito/billing del provider: non è la quota interna dell'app e non deve
  // mai essere mostrato come “riprova domani”. Viene prima del 429 generico,
  // perché OpenAI usa 429 anche per credito esaurito.
  if (
    code === "credit_balance_exhausted"
    || code === "insufficient_quota"
    || type === "insufficient_quota"
    || code === "billing_hard_limit_reached"
  ) {
    return new AiError(
      "AI_PROVIDER_CREDITS_EXHAUSTED",
      `OpenAI provider credits exhausted (status ${status}, code ${code || type})`,
    );
  }

  // Rate limit temporaneo del provider
  if (status === 429 || code === "rate_limit_exceeded") {
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
