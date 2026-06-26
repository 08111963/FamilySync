type AiErrorLike = {
  status?: number;
  body?: { error?: { code?: string; message?: string } };
};

const FALLBACK_BY_CODE: Record<string, string> = {
  AI_RATE_LIMITED: "Hai raggiunto il limite giornaliero per questa funzione AI. Riprova domani.",
  AI_USAGE_UNAVAILABLE: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova più tardi.",
  AI_NOT_CONFIGURED: "Le funzioni AI non sono al momento disponibili. Riprova più tardi.",
  AI_TIMEOUT: "L'AI ci sta mettendo troppo tempo. Riprova tra poco.",
  AI_BAD_RESPONSE: "L'AI ha restituito una risposta non valida. Riprova.",
  AI_PROVIDER_ERROR: "Servizio AI temporaneamente non disponibile. Riprova tra poco.",
};

/** True se l'errore è dovuto al toggle AI disattivato (GDPR consent). */
export function isAiDisabled(err: unknown): boolean {
  const e = err as AiErrorLike;
  return e?.status === 403 || e?.body?.error?.code === "AI_DISABLED";
}

/**
 * Estrae un messaggio utente semplice in italiano da un errore AI.
 * Usa il messaggio del server se presente, altrimenti una mappa per codice,
 * altrimenti il fallback fornito.
 */
export function aiErrorMessage(err: unknown, fallback: string): string {
  const e = err as AiErrorLike;
  const code = e?.body?.error?.code;
  const serverMsg = e?.body?.error?.message;
  if (serverMsg && typeof serverMsg === "string") return serverMsg;
  if (code && FALLBACK_BY_CODE[code]) return FALLBACK_BY_CODE[code];
  return fallback;
}
