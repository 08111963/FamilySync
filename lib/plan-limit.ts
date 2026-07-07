/**
 * Riconoscimento del limite giornaliero del piano FREE sulle funzioni di base
 * (calendario, spesa, faccende, chat). Il backend risponde 429 con
 * { error: { code: "FREE_DAILY_LIMIT_REACHED", message } }.
 *
 * Gli errori possono arrivare in due forme:
 * - apiRequest: `Error` con `.status` e `.body` allegati (vedi throwIfResNotOk);
 * - apiFetch/apiUpload: oggetto `{ status, body }`.
 * Questo helper gestisce entrambe.
 */
const LIMIT_CODE = "FREE_DAILY_LIMIT_REACHED";

const DEFAULT_MESSAGE =
  "Hai raggiunto il limite giornaliero del piano Free per questa funzione (condiviso da tutta la famiglia). Passa a Premium per usarne quanti vuoi, oppure riprova domani.";

type ErrLike = {
  status?: number;
  message?: string;
  body?: { error?: { code?: string; message?: string } } | null;
};

/**
 * Se l'errore è il limite del piano Free, ritorna il messaggio da mostrare
 * all'utente; altrimenti null.
 */
export function freeLimitMessage(err: unknown): string | null {
  const e = err as ErrLike;
  const body = e?.body;
  if (body?.error?.code === LIMIT_CODE) {
    return body.error.message || DEFAULT_MESSAGE;
  }
  // Fallback: alcuni percorsi incapsulano il JSON nel messaggio ("429: {...}").
  if (typeof e?.message === "string" && e.message.includes(LIMIT_CODE)) {
    const idx = e.message.indexOf("{");
    if (idx >= 0) {
      try {
        const parsed = JSON.parse(e.message.slice(idx));
        if (parsed?.error?.code === LIMIT_CODE) {
          return parsed.error.message || DEFAULT_MESSAGE;
        }
      } catch {}
    }
    return DEFAULT_MESSAGE;
  }
  return null;
}
