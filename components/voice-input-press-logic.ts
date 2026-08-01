/**
 * Logica pura delle decisioni del pulsante microfono (VoiceInput).
 *
 * Estratta dal componente per poterla testare senza React/expo-audio:
 * - su WEB: tap = avvia, secondo tap = ferma e trascrive (modalità toggle);
 *   solo il blur della finestra annulla un avvio in corso.
 * - su NATIVO: hold-to-talk stile WhatsApp (rilascio breve = annulla,
 *   rilascio dopo la soglia = trascrivi).
 *
 * Il componente esegue le azioni restituite; qui non ci sono side effect.
 */

export const SHORT_TAP_MS = 250;

export type PressInAction =
  | "ignore" // occupato (trascrizione/lock/disabled/avvio in corso)
  | "stopAndTranscribe" // toggle: secondo tocco mentre registra
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
  if (state.recording) return "stopAndTranscribe";
  return "startRecording";
}

export type PressOutAction =
  | "clearJustStopped" // rilascio del tocco che ha appena fermato: ignora
  | "markReleasedWhileStarting" // nativo: rilascio durante l'avvio → annulla appena pronto
  | "keepRecording" // web: tap breve o rilascio durante l'avvio → resta in registrazione
  | "cancelRecording" // nativo: tocco troppo breve → annulla in silenzio
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
    // Su web un tap breve è l'uso normale (toggle): la registrazione continua.
    // Su nativo il rilascio durante l'avvio annulla (hold-to-talk).
    return state.isWeb ? "keepRecording" : "markReleasedWhileStarting";
  }
  if (!state.recording) return "ignore";
  if (state.elapsedMs < SHORT_TAP_MS) {
    // Tocco breve: web → toggle (continua a registrare); nativo → annulla.
    return state.isWeb ? "keepRecording" : "cancelRecording";
  }
  return "stopAndTranscribe";
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
 * Al termine dell'avvio del recorder: se nel frattempo è arrivata la richiesta
 * di annullare (blur su web, rilascio su nativo), annulla subito in silenzio.
 */
export function decideStartCompleted(state: { releasedWhileStarting: boolean }): "cancelRecording" | "keepRecording" {
  return state.releasedWhileStarting ? "cancelRecording" : "keepRecording";
}
