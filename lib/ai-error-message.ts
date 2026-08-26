import { Alert, Platform } from "react-native";

type AiErrorLike = {
  status?: number;
  body?: { error?: { code?: string; message?: string } };
};

const FALLBACK_BY_CODE: Record<string, string> = {
  AI_RATE_LIMITED: "Hai raggiunto il limite del tuo piano per questa funzione AI. Riprova più avanti.",
  AI_PROVIDER_CREDITS_EXHAUSTED: "Le generazioni AI sono temporaneamente sospese perché il credito del servizio AI dell'app è esaurito. Riprova dopo il ripristino del credito.",
  AI_USAGE_UNAVAILABLE: "Impossibile verificare il limite di utilizzo AI in questo momento. Riprova più tardi.",
  AI_NOT_CONFIGURED: "Le funzioni AI non sono al momento disponibili. Riprova più tardi.",
  AI_TIMEOUT: "L'AI ci sta mettendo troppo tempo. Riprova tra poco.",
  AI_BAD_RESPONSE: "La risposta dell'AI non era completa o nel formato previsto. Non è stato creato alcun piano: riprova.",
  AI_CONSTRAINT_VIOLATION: "Il risultato dell'AI non è compatibile con il profilo scelto. Non è stato creato alcun piano: riprova.",
  AI_PROVIDER_ERROR: "Servizio AI temporaneamente non disponibile. Riprova tra poco.",
};

/** Compatibilità con le versioni precedenti che potevano restituire AI_DISABLED. */
export function isAiDisabled(err: unknown): boolean {
  const e = err as AiErrorLike;
  return e?.body?.error?.code === "AI_DISABLED";
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

/**
 * Mostra l'errore AI all'utente. Le risposte AI_DISABLED di client/server
 * precedenti restano gestite come indisponibilità del profilo.
 */
export function showAiErrorAlert(err: unknown, fallback: string, title = "Errore") {
  const msg = isAiDisabled(err)
    ? "Funzionalità AI non disponibile per questo profilo."
    : aiErrorMessage(err, fallback);
  if (Platform.OS === "web") {
    const win = globalThis as any;
    if (typeof win?.alert === "function") {
      win.alert(`${title}\n\n${msg}`);
      return;
    }
  }
  Alert.alert(title, msg);
}
