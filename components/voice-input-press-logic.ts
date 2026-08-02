/**
 * Logica pura delle decisioni del pulsante microfono (VoiceInput).
 *
 * Estratta dal componente per poterla testare senza React/expo-audio.
 * Comportamento stile WhatsApp su TUTTE le piattaforme (scelta esplicita
 * dell'utente, 2 ago 2026): tieni premuto → parla → rilascia → trascrive.
 *
 * Differenza web vs nativo: su web un tocco troppo breve NON viene annullato
 * in silenzio (l'utente non capirebbe perché non succede nulla) ma mostra un
 * breve suggerimento non bloccante ("tieni premuto mentre parli").
 * Su nativo resta l'annullamento silenzioso, come WhatsApp.
 *
 * Il componente esegue le azioni restituite; qui non ci sono side effect.
 */

export const SHORT_TAP_MS = 250;

export type PressInAction =
  | "ignore" // occupato (trascrizione/lock/disabled/avvio in corso)
  | "stopAndTranscribe" // recovery: nuova pressione mentre registra (pointerup perso)
  | "startRecording";

export function decidePressIn(state: {
  transcribing: boolean;
  lockedByOther: boolean;
  disabled: boolean;
  starting: boolean;
  recording: boolean;
}): PressInAction {
  if (state.transcribing || state.lockedByOther || state.disabled) return "ignore";
  if (state.starting) return "ignore";
  // Se risultiamo ancora "in registrazione" a una nuova pressione, il rilascio
  // precedente è andato perso (quirk del browser): fermiamo e trascriviamo,
  // così l'utente non resta mai col microfono acceso senza saperlo.
  if (state.recording) return "stopAndTranscribe";
  return "startRecording";
}

export type PressOutAction =
  | "clearJustStopped" // rilascio del tocco che ha appena fermato: ignora
  | "markReleasedWhileStarting" // rilascio durante l'avvio → annulla appena pronto
  | "cancelRecording" // nativo: tocco troppo breve → annulla in silenzio
  | "cancelWithHint" // web: tocco troppo breve → annulla + suggerimento visivo
  | "stopAndTranscribe" // hold completato: ferma e trascrivi
  | "ignore"; // non stavamo registrando

export function decidePressOut(state: {
  isWeb: boolean;
  justStopped: boolean;
  starting: boolean;
  recording: boolean;
  elapsedMs: number;
}): PressOutAction {
  if (state.justStopped) return "clearJustStopped";
  if (state.starting) {
    // Rilascio mentre il recorder si sta ancora avviando (permessi, getUserMedia):
    // stile WhatsApp, si annulla appena l'avvio termina. Su web il componente
    // mostrerà anche il suggerimento, perché spesso l'utente HA tenuto premuto
    // ma l'avvio era lento.
    return "markReleasedWhileStarting";
  }
  if (!state.recording) return "ignore";
  if (state.elapsedMs < SHORT_TAP_MS) {
    // Tocco troppo breve: nativo annulla in silenzio (come WhatsApp),
    // web annulla ma spiega con un suggerimento visivo non bloccante.
    return state.isWeb ? "cancelWithHint" : "cancelRecording";
  }
  return "stopAndTranscribe";
}

export type PointerCancelAction =
  | "markLostPointerWhileStarting" // avvio in corso: NON annullare, tracking perso
  | "keepRecordingWithHint" // registra: continua + spiega come fermare
  | "none";

/**
 * Web: `pointercancel` significa che il BROWSER ha smesso di tracciare il dito
 * (non che l'utente ha rilasciato!). Succede su alcuni Android durante l'avvio
 * del microfono. In quel caso il vero rilascio non arriverà mai: la
 * registrazione deve CONTINUARE e l'utente la ferma con un tocco (recovery in
 * decidePressIn) o col timeout di sicurezza.
 */
export function decidePointerCancel(state: { starting: boolean; recording: boolean }): PointerCancelAction {
  if (state.starting) return "markLostPointerWhileStarting";
  if (state.recording) return "keepRecordingWithHint";
  return "none";
}

export type WindowBlurAction =
  | "markReleasedWhileStarting" // blur durante l'avvio: annulla appena pronto
  | "cancelRecording" // blur mentre registra: chiudi subito
  | "none";

export function decideWindowBlur(state: { starting: boolean; recording: boolean }): WindowBlurAction {
  if (state.starting) return "markReleasedWhileStarting";
  if (state.recording) return "cancelRecording";
  return "none";
}

/**
 * Al termine dell'avvio del recorder:
 * - se l'utente ha DAVVERO rilasciato (pointerup/blur durante l'avvio) → annulla;
 * - se il browser ha solo perso il tracciamento (pointercancel) → continua a
 *   registrare e mostra come fermare (il vero rilascio non arriverà mai).
 */
export function decideStartCompleted(state: {
  releasedWhileStarting: boolean;
  lostPointerWhileStarting?: boolean;
}): "cancelRecording" | "keepRecording" | "keepRecordingWithHint" {
  if (state.releasedWhileStarting) return "cancelRecording";
  if (state.lostPointerWhileStarting) return "keepRecordingWithHint";
  return "keepRecording";
}
