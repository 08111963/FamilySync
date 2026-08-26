import { Alert, Platform } from "react-native";
import { router } from "expo-router";

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

/** Apre il Centro Privacy con policy, termini e registro delle accettazioni. */
export function openAiSettings() {
  router.push("/privacy-center");
}

/**
 * Mostra l'errore AI all'utente. Le risposte AI_DISABLED di client/server
 * precedenti restano gestite con un link al Centro Privacy.
 * Per gli altri errori mostra il solito messaggio con OK.
 */
export function showAiErrorAlert(err: unknown, fallback: string, title = "Errore") {
  const msg = aiErrorMessage(err, fallback);
  if (isAiDisabled(err)) {
    if (Platform.OS === "web") {
      const win = globalThis as any;
      const ok =
        typeof win?.confirm === "function"
          ? win.confirm(`${msg}\n\nVuoi andare alle impostazioni per attivarle ora?`)
          : false;
      if (ok) openAiSettings();
      return;
    }
    Alert.alert(title, msg, [
      { text: "Annulla", style: "cancel" },
      { text: "Vai alle impostazioni", onPress: openAiSettings },
    ]);
    return;
  }
  if (Platform.OS === "web") {
    const win = globalThis as any;
    if (typeof win?.alert === "function") {
      win.alert(`${title}\n\n${msg}`);
      return;
    }
  }
  Alert.alert(title, msg);
}
