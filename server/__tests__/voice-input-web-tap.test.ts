/**
 * Task: verificare che il microfono su WEB funzioni con un semplice tocco.
 *
 * Un bug faceva sì che un tap breve sul microfono su web annullasse la
 * registrazione in silenzio (nessuna rotellina, nessun messaggio, nessuna
 * richiesta al server). Comportamento atteso:
 * - web: tap = avvia, secondo tap = ferma e trascrive (toggle);
 *   solo il blur della finestra annulla.
 * - nativo: hold-to-talk invariato (rilascio breve = annulla in silenzio).
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

describe("WEB: tap breve = toggle, la registrazione NON viene annullata in silenzio", () => {
  test("tap breve → registrazione resta attiva → secondo tap → stopAndTranscribe", () => {
    const mic = createMicSimulator("web");

    assert.equal(mic.pressIn(), "startRecording");
    mic.startCompleted();
    mic.advance(80); // tap molto breve
    assert.equal(mic.pressOut(), "keepRecording");

    // Regressione del bug: la registrazione deve restare ATTIVA, senza cancel
    assert.equal(mic.state.recording, true);
    assert.ok(!mic.calls.includes("cancelRecording"), "il tap breve non deve annullare in silenzio");
    assert.ok(!mic.calls.includes("stopAndTranscribe"));

    // Secondo tap: ferma e trascrive
    mic.advance(1500);
    assert.equal(mic.pressIn(), "stopAndTranscribe");
    assert.deepEqual(mic.calls, ["startRecording", "stopAndTranscribe"]);
    assert.equal(mic.state.transcribing, true);

    // Il rilascio del secondo tap non deve rifermarla/riavviarla
    assert.equal(mic.pressOut(), "clearJustStopped");
    assert.equal(mic.state.justStopped, false);
  });

  test("rilascio durante l'avvio (prompt permesso) su web NON annulla: la registrazione parte", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    // L'utente rilascia mentre il browser mostra il prompt del permesso
    assert.equal(mic.pressOut(), "keepRecording");
    assert.equal(mic.state.releasedWhileStarting, false);

    mic.startCompleted();
    assert.equal(mic.state.recording, true);
    assert.ok(!mic.calls.includes("cancelRecording"));
  });

  test("blur della finestra DURANTE l'avvio → annullamento appena il recorder è pronto", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    assert.equal(mic.windowBlur(), "markReleasedWhileStarting");
    assert.equal(mic.state.releasedWhileStarting, true);

    mic.startCompleted();
    assert.ok(mic.calls.includes("cancelRecording"), "il blur durante l'avvio deve annullare");
    assert.equal(mic.state.recording, false);
    assert.ok(!mic.calls.includes("stopAndTranscribe"), "annullamento silenzioso: nessuna trascrizione");
  });

  test("blur della finestra MENTRE registra → annullamento immediato", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    mic.startCompleted();
    assert.equal(mic.windowBlur(), "cancelRecording");
    assert.equal(mic.state.recording, false);
  });

  test("hold >250ms con rilascio su web → trascrizione (comportamento desktop invariato)", () => {
    const mic = createMicSimulator("web");
    mic.pressIn();
    mic.startCompleted();
    mic.advance(SHORT_TAP_MS + 50);
    assert.equal(mic.pressOut(), "stopAndTranscribe");
    assert.deepEqual(mic.calls, ["startRecording", "stopAndTranscribe"]);
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
    // Il vecchio bug: confronto elapsed < 250 direttamente nel componente
    assert.doesNotMatch(src, /elapsed\s*<\s*250/);
  });
});
