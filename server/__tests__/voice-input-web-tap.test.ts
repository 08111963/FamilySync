/**
 * Microfono stile WhatsApp su TUTTE le piattaforme (scelta esplicita
 * dell'utente, 2 ago 2026): tieni premuto → parla → rilascia → trascrive.
 *
 * Differenza web vs nativo:
 * - web: un tocco troppo breve annulla ma mostra un suggerimento visivo
 *   non bloccante (mai annullare in silenzio: l'utente non capirebbe);
 * - nativo: tocco breve annulla in silenzio, come WhatsApp.
 *
 * Test comportamentali sulla logica pura estratta in
 * components/voice-input-press-logic.ts + verifica del cablaggio nel componente.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SHORT_TAP_MS,
  decidePressIn,
  decidePressOut,
  decideStartCompleted,
  decideWindowBlur,
} from "../../components/voice-input-press-logic";

const idle = { transcribing: false, lockedByOther: false, disabled: false };

/**
 * Piccolo harness che simula il ciclo di vita del componente usando le stesse
 * decisioni pure, così i test raccontano scenari completi (tap, hold, blur).
 */
function createMicSimulator(platform: "web" | "native") {
  const isWeb = platform === "web";
  const state = {
    starting: false,
    recording: false,
    transcribing: false,
    justStopped: false,
    releasedWhileStarting: false,
    recordStart: 0,
  };
  const calls: string[] = [];
  let now = 1_000_000;

  const cancelRecording = () => {
    calls.push("cancelRecording");
    state.recording = false;
  };
  const stopAndTranscribe = () => {
    calls.push("stopAndTranscribe");
    state.recording = false;
    state.transcribing = true;
  };
  const showHint = () => {
    calls.push("showHint");
  };

  return {
    state,
    calls,
    advance(ms: number) {
      now += ms;
    },
    pressIn() {
      const action = decidePressIn({
        transcribing: state.transcribing,
        lockedByOther: false,
        disabled: false,
        starting: state.starting,
        recording: state.recording,
      });
      if (action === "ignore") return action;
      if (action === "stopAndTranscribe") {
        state.justStopped = true;
        stopAndTranscribe();
        return action;
      }
      // startRecording: fase di avvio asincrona (permessi, prepareToRecord)
      calls.push("startRecording");
      state.starting = true;
      state.releasedWhileStarting = false;
      return action;
    },
    /** Il recorder ha finito l'avvio (perm ok, record() partito). */
    startCompleted() {
      state.recording = true;
      state.recordStart = now;
      if (decideStartCompleted({ releasedWhileStarting: state.releasedWhileStarting }) === "cancelRecording") {
        state.releasedWhileStarting = false;
        cancelRecording();
        if (isWeb) showHint();
      }
      state.starting = false;
    },
    pressOut() {
      const action = decidePressOut({
        isWeb,
        justStopped: state.justStopped,
        starting: state.starting,
        recording: state.recording,
        elapsedMs: now - state.recordStart,
      });
      switch (action) {
        case "clearJustStopped":
          state.justStopped = false;
          break;
        case "markReleasedWhileStarting":
          state.releasedWhileStarting = true;
          break;
        case "cancelRecording":
          cancelRecording();
          break;
        case "cancelWithHint":
          cancelRecording();
          showHint();
          break;
        case "stopAndTranscribe":
          stopAndTranscribe();
          break;
      }
      return action;
    },
    windowBlur() {
      const action = decideWindowBlur({ starting: state.starting, recording: state.recording });
      if (action === "markReleasedWhileStarting") state.releasedWhileStarting = true;
      if (action === "cancelRecording") cancelRecording();
      return action;
    },
  };
}

describe("WEB: hold-to-talk stile WhatsApp", () => {
  test("tieni premuto → rilascia → stopAndTranscribe (flusso principale)", () => {
    const mic = createMicSimulator("web");
    assert.equal(mic.pressIn(), "startRecording");
    mic.startCompleted();
    mic.advance(SHORT_TAP_MS + 800); // l'utente parla tenendo premuto
    assert.equal(mic.pressOut(), "stopAndTranscribe");
    assert.deepEqual(mic.calls, ["startRecording", "stopAndTranscribe"]);
    assert.equal(mic.state.transcribing, true);
  });

  test("tocco breve → annulla MA mostra il suggerimento (mai in silenzio)", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    mic.startCompleted();
    mic.advance(80); // tap molto breve
    assert.equal(mic.pressOut(), "cancelWithHint");
    assert.equal(mic.state.recording, false, "il tap breve non deve lasciare il microfono acceso");
    assert.ok(mic.calls.includes("showHint"), "l'utente deve capire come si usa");
    assert.ok(!mic.calls.includes("stopAndTranscribe"));
  });

  test("rilascio durante un avvio lento → annulla appena pronto + suggerimento", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    // L'utente ha tenuto premuto ma l'avvio (getUserMedia) era lento: rilascia prima
    assert.equal(mic.pressOut(), "markReleasedWhileStarting");
    assert.equal(mic.state.releasedWhileStarting, true);

    mic.startCompleted();
    assert.equal(mic.state.recording, false, "il microfono NON deve restare acceso dopo il rilascio");
    assert.ok(mic.calls.includes("cancelRecording"));
    assert.ok(mic.calls.includes("showHint"));
    assert.ok(!mic.calls.includes("stopAndTranscribe"));
  });

  test("recovery: nuova pressione mentre risulta ancora in registrazione (pointerup perso) → ferma e trascrive", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    mic.startCompleted();
    mic.advance(3000);
    // pointerup perso: arriva direttamente una nuova pressione
    assert.equal(mic.pressIn(), "stopAndTranscribe");
    assert.equal(mic.state.transcribing, true);
    // Il rilascio di quel tocco non deve rifermare/riavviare
    assert.equal(mic.pressOut(), "clearJustStopped");
    assert.equal(mic.state.justStopped, false);
  });

  test("blur della finestra DURANTE l'avvio → annullamento appena il recorder è pronto", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    assert.equal(mic.windowBlur(), "markReleasedWhileStarting");
    mic.startCompleted();
    assert.ok(mic.calls.includes("cancelRecording"), "il blur durante l'avvio deve annullare");
    assert.equal(mic.state.recording, false);
    assert.ok(!mic.calls.includes("stopAndTranscribe"), "nessuna trascrizione");
  });

  test("blur della finestra MENTRE registra → annullamento immediato", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    mic.startCompleted();
    assert.equal(mic.windowBlur(), "cancelRecording");
    assert.equal(mic.state.recording, false);
  });

  test("pressIn ignorato mentre trascrive / bloccato / disabled / in avvio", () => {
    assert.equal(decidePressIn({ ...idle, transcribing: true, starting: false, recording: false }), "ignore");
    assert.equal(decidePressIn({ ...idle, lockedByOther: true, starting: false, recording: false }), "ignore");
    assert.equal(decidePressIn({ ...idle, disabled: true, starting: false, recording: false }), "ignore");
    assert.equal(decidePressIn({ ...idle, starting: true, recording: false }), "ignore");
  });
});

describe("NATIVO: hold-to-talk invariato", () => {
  test("rilascio breve (<250ms) → annulla in silenzio", () => {
    const mic = createMicSimulator("native");
    mic.pressIn();
    mic.startCompleted();
    mic.advance(100);
    assert.equal(mic.pressOut(), "cancelRecording");
    assert.equal(mic.state.recording, false);
    assert.ok(!mic.calls.includes("stopAndTranscribe"));
    assert.ok(!mic.calls.includes("showHint"), "su nativo l'annullamento resta silenzioso");
  });

  test("rilascio durante l'avvio → annulla appena il recorder è pronto", () => {
    const mic = createMicSimulator("native");
    mic.pressIn();
    assert.equal(mic.pressOut(), "markReleasedWhileStarting");
    mic.startCompleted();
    assert.ok(mic.calls.includes("cancelRecording"));
  });

  test("hold lungo con rilascio → trascrizione", () => {
    const mic = createMicSimulator("native");
    mic.pressIn();
    mic.startCompleted();
    mic.advance(SHORT_TAP_MS + 200);
    assert.equal(mic.pressOut(), "stopAndTranscribe");
  });
});

describe("Cablaggio: VoiceInput usa davvero la logica pura estratta", () => {
  const src = readFileSync(join(process.cwd(), "components/VoiceInput.tsx"), "utf8");

  test("importa le decision function da voice-input-press-logic", () => {
    assert.match(src, /from\s+["']@\/components\/voice-input-press-logic["']/);
    for (const fn of ["decidePressIn", "decidePressOut", "decideWindowBlur", "decideStartCompleted"]) {
      assert.match(src, new RegExp(`${fn}\\s*\\(`), `${fn} deve essere usata nel componente`);
    }
  });

  test("handlePressOut passa isWeb da Platform.OS e non ha più branch hardcoded sul tap breve", () => {
    assert.match(src, /isWeb:\s*Platform\.OS\s*===\s*["']web["']/);
    assert.doesNotMatch(src, /elapsed\s*<\s*250/);
  });

  test("il tocco breve su web mostra il suggerimento (cancelWithHint cablato)", () => {
    assert.match(src, /case\s+["']cancelWithHint["']/);
    assert.match(src, /showHint\(/);
  });
});
