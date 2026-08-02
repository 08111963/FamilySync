/**
 * Task: lo spinner di avvio del microfono deve guidare davvero l'utente.
 *
 * Regressioni bloccate da questo test (components/VoiceInput.tsx):
 * 1. Al tocco lo spinner (testID "voice-starting") compare SUBITO:
 *    setStarting(true) è sincrono, prima di qualunque await in startRecording.
 * 2. Lo spinner sparisce quando la registrazione parte davvero: la condizione
 *    di render è `starting && !recording` e setRecording(true) scatta solo
 *    dopo recorder.record(); l'icona rossa indica che si può parlare.
 * 3. La richiesta di trascrizione include durationMs, calcolato dal momento
 *    reale di avvio della registrazione (recordStartRef).
 *
 * Convenzione repo: nessun test-runner UI configurato → test di wiring sul
 * sorgente con node:test (vedi bills-frontend-wiring.test.ts).
 * Esecuzione: npx tsx server/__tests__/voice-starting-spinner.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "components/VoiceInput.tsx"), "utf8");

/** Estrae il corpo di una funzione/arrow assegnata a `const <name> = ...` (bilanciando le graffe). */
function extractFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `funzione ${name} non trovata in VoiceInput.tsx`);
  const open = source.indexOf("{", start);
  assert.ok(open > start, `corpo di ${name} non trovato`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail(`graffe non bilanciate nel corpo di ${name}`);
}

describe("Spinner di avvio microfono (testID voice-starting)", () => {
  test("lo spinner compare SUBITO al tocco: setStarting(true) prima di ogni await", () => {
    const body = extractFunctionBody(src, "startRecording");
    const startingIdx = body.indexOf("setStarting(true)");
    assert.ok(startingIdx >= 0, "startRecording deve chiamare setStarting(true)");
    const firstAwait = body.indexOf("await ");
    assert.ok(firstAwait >= 0, "startRecording deve contenere await (permessi/preparazione)");
    assert.ok(
      startingIdx < firstAwait,
      "setStarting(true) deve essere sincrono, PRIMA del primo await, altrimenti lo spinner non compare subito al tocco"
    );
  });

  test("il tocco sul pulsante avvia startRecording (spinner collegato al gesto)", () => {
    assert.match(src, /testID=["'`]voice-input-button["'`]/);
    // Nativo: press handler del Pressable; web: pointerdown DOM (setPointerCapture)
    assert.match(src, /onPressIn=\{Platform\.OS === "web" \? undefined : handlePressIn\}/);
    assert.match(src, /pointerdown/);
    const pressIn = extractFunctionBody(src, "handlePressIn");
    assert.match(pressIn, /startRecording\(\)/);
  });

  test("lo spinner è un ActivityIndicator con testID voice-starting reso solo mentre si avvia e NON registra", () => {
    // condizione di render: starting && !recording → spinner; altrimenti icona
    assert.match(
      src,
      /\{starting\s*&&\s*!recording\s*\?[\s\S]*?<ActivityIndicator[^>]*testID=["'`]voice-starting["'`]/,
      "lo spinner voice-starting deve essere reso solo quando starting && !recording"
    );
  });

  test("lo spinner sparisce quando parte la registrazione: setRecording(true) solo dopo recorder.record()", () => {
    const body = extractFunctionBody(src, "startRecording");
    const recordIdx = body.indexOf("recorder.record()");
    const recTrueIdx = body.indexOf("setRecording(true)");
    assert.ok(recordIdx >= 0, "startRecording deve chiamare recorder.record()");
    assert.ok(recTrueIdx >= 0, "startRecording deve chiamare setRecording(true)");
    assert.ok(
      recordIdx < recTrueIdx,
      "setRecording(true) deve avvenire DOPO recorder.record(): l'icona rossa significa 'sto registrando davvero'"
    );
  });

  test("setStarting(false) è nel finally: lo spinner non resta appeso né su successo né su errore", () => {
    const body = extractFunctionBody(src, "startRecording");
    assert.match(
      body,
      /finally\s*\{[\s\S]*?setStarting\(false\)[\s\S]*?\}/,
      "setStarting(false) deve stare nel blocco finally di startRecording"
    );
  });

  test("l'icona rossa (radio-button-on) è mostrata solo quando recording è true", () => {
    assert.match(src, /name=\{recording\s*\?\s*["'`]radio-button-on["'`]\s*:\s*["'`]mic-outline["'`]\}/);
    assert.match(src, /color=\{recording\s*\?\s*["'`]#FF6B6B["'`]/);
  });
});

describe("durationMs nella richiesta di trascrizione", () => {
  const stopBody = extractFunctionBody(src, "stopAndTranscribe");

  test("recordStartRef viene fissato all'avvio reale della registrazione", () => {
    const startBody = extractFunctionBody(src, "startRecording");
    const recordIdx = startBody.indexOf("recorder.record()");
    const refIdx = startBody.indexOf("recordStartRef.current = Date.now()");
    assert.ok(refIdx >= 0, "startRecording deve impostare recordStartRef.current = Date.now()");
    assert.ok(recordIdx >= 0 && refIdx > recordIdx, "recordStartRef va fissato dopo recorder.record()");
  });

  test("la durata è calcolata PRIMA di fermare il recorder (misura reale)", () => {
    const durIdx = stopBody.indexOf("const durationMs");
    const stopIdx = stopBody.indexOf("recorder.stop()");
    assert.ok(durIdx >= 0, "stopAndTranscribe deve calcolare durationMs");
    assert.ok(stopIdx >= 0 && durIdx < stopIdx, "durationMs va calcolato prima di recorder.stop()");
    assert.match(stopBody, /Date\.now\(\)\s*-\s*recordStartRef\.current/);
  });

  test("durationMs viene incluso nel FormData della richiesta di trascrizione", () => {
    assert.match(
      stopBody,
      /formData\.append\(\s*["'`]durationMs["'`]\s*,\s*String\(Math\.round\(durationMs\)\)\s*\)/,
      "la richiesta di trascrizione deve includere il campo durationMs"
    );
    assert.match(stopBody, /apiUpload[\s\S]*?\/transcribe/);
  });
});
