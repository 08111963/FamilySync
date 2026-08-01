import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, ActivityIndicator, Alert, Animated, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";

import { useTheme } from "@/hooks/useTheme";
import {
  decidePressIn,
  decidePressOut,
  decideStartCompleted,
  decideWindowBlur,
} from "@/components/voice-input-press-logic";
import { apiUpload } from "@/lib/query-client";
import { aiErrorMessage } from "@/lib/ai-error-message";

// ---- Lock globale: un solo microfono attivo alla volta ----
// Evita registrazioni concorrenti quando più VoiceInput sono nella stessa
// schermata (es. campi Dieta e Allergie del piano pasti).
let activeMicId: string | null = null;
const micListeners = new Set<() => void>();

function setActiveMic(id: string | null) {
  activeMicId = id;
  micListeners.forEach((l) => l());
}

function subscribeMic(listener: () => void) {
  micListeners.add(listener);
  return () => {
    micListeners.delete(listener);
  };
}

function getActiveMic() {
  return activeMicId;
}

const MAX_RECORDING_MS = 60_000;
function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    const win = globalThis as any;
    if (typeof win?.alert === "function") {
      win.alert(`${title}\n\n${message}`);
      return;
    }
  }
  Alert.alert(title, message);
}

async function resetAudioMode() {
  try {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  } catch {
    // best effort: non bloccare l'utente se il reset fallisce
  }
}

interface VoiceInputProps {
  familyId: string;
  onTranscribed: (text: string) => void;
  size?: number;
  disabled?: boolean;
  /** Contesto opzionale inviato al server per migliorare l'accuratezza della trascrizione. */
  context?: string;
}

/**
 * Pulsante microfono per la dettatura vocale, stile "tieni premuto per parlare":
 * premi e tieni premuto, parla, poi rilascia. L'audio viene trascritto in testo
 * dal backend (OpenAI) e passato a onTranscribed.
 */
export function VoiceInput({ familyId, onTranscribed, size = 22, disabled, context }: VoiceInputProps) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const idRef = useRef(`mic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const recordingRef = useRef(false);
  const pressedRef = useRef(false);
  const startingRef = useRef(false);
  const recordStartRef = useRef(0);
  const justStoppedRef = useRef(false);
  const releasedWhileStartingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const activeMic = useSyncExternalStore(subscribeMic, getActiveMic, getActiveMic);
  const lockedByOther = activeMic !== null && activeMic !== idRef.current;

  // Cleanup su unmount: se stavamo registrando, ferma il recorder,
  // ripristina l'audio mode e rilascia il lock.
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current = false;
        try {
          const p = recorder.stop();
          if (p && typeof (p as Promise<unknown>).catch === "function") {
            (p as Promise<unknown>).catch(() => {});
          }
        } catch {}
        resetAudioMode();
      }
      if (activeMicId === idRef.current) setActiveMic(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelRecording = async () => {
    recordingRef.current = false;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {}
    await resetAudioMode();
    setActiveMic(null);
  };

  const startRecording = async () => {
    if (getActiveMic() !== null) return; // un altro mic sta già registrando
    setActiveMic(idRef.current);
    startingRef.current = true;
    setStarting(true);
    releasedWhileStartingRef.current = false;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setActiveMic(null);
        showAlert(
          "Microfono non disponibile",
          Platform.OS === "web"
            ? "Il browser sta bloccando il microfono per questo sito. Tocca l'icona del lucchetto (o ⓘ) accanto all'indirizzo, apri Autorizzazioni e imposta Microfono su Consenti, poi ricarica la pagina."
            : "Per usare la dettatura vocale, consenti l'accesso al microfono nelle impostazioni del dispositivo."
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
      recordingRef.current = true;
      setRecording(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      // Stile WhatsApp: se l'utente ha già rilasciato mentre stavamo avviando
      // (es. durante la richiesta di permesso del browser), non lasciare il
      // microfono acceso: annulla subito in silenzio. L'utente ripremerà.
      if (decideStartCompleted({ releasedWhileStarting: releasedWhileStartingRef.current }) === "cancelRecording") {
        releasedWhileStartingRef.current = false;
        await cancelRecording();
        return;
      }
    } catch (err) {
      console.error("Errore avvio registrazione:", err);
      recordingRef.current = false;
      setRecording(false);
      setActiveMic(null);
      await resetAudioMode();
      showAlert("Dettatura", "Impossibile avviare la registrazione su questo dispositivo.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const stopAndTranscribe = async () => {
    // Durata reale della registrazione: aiuta il server a distinguere i clip
    // quasi vuoti (trascritti senza prompt) dalle frasi normali.
    const durationMs = recordStartRef.current > 0 ? Date.now() - recordStartRef.current : 0;
    recordingRef.current = false;
    setRecording(false);
    setTranscribing(true);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (err) {
      console.error("Errore stop registrazione:", err);
    } finally {
      // Il ripristino dell'audio mode avviene SEMPRE, anche se stop() fallisce
      await resetAudioMode();
    }

    try {
      if (!uri) throw new Error("Nessun audio registrato");

      const formData = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await globalThis.fetch(uri)).blob();
        const type = (blob.type || "audio/webm").split(";")[0];
        const ext = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : "m4a";
        formData.append("audio", new File([blob], `voice.${ext}`, { type }));
      } else {
        formData.append("audio", {
          uri,
          name: "voice.m4a",
          type: "audio/m4a",
        } as any);
      }

      if (context) formData.append("context", context);
      if (durationMs > 0) formData.append("durationMs", String(Math.round(durationMs)));

      const res = await apiUpload<{ text: string }>(`/api/ai/${familyId}/transcribe`, formData);
      const text = (res.text || "").trim();
      if (text) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        onTranscribed(text);
      } else {
        showAlert("Dettatura", "Non ho sentito nulla. Riprova parlando più vicino al microfono.");
      }
    } catch (err) {
      console.error("Errore trascrizione:", err);
      showAlert("Dettatura", aiErrorMessage(err, "Impossibile trascrivere l'audio. Riprova."));
    } finally {
      setTranscribing(false);
      setActiveMic(null);
    }
  };

  // Timeout di sicurezza (solo web): se l'utente dimentica il secondo tocco,
  // dopo MAX_RECORDING_MS la registrazione si ferma da sola e trascrive.
  useEffect(() => {
    if (Platform.OS !== "web" || !recording) return;
    const elapsed = Date.now() - recordStartRef.current;
    const remaining = Math.max(0, MAX_RECORDING_MS - elapsed);
    const timer = setTimeout(() => {
      if (recordingRef.current) {
        stopAndTranscribe();
      }
    }, remaining);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // Pulsazione dell'icona mentre registra: rende lo stato "sto registrando"
  // chiaramente visibile anche senza guardare da vicino il colore dell'icona.
  useEffect(() => {
    if (!recording) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.35,
          duration: 550,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 550,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // Web: se il puntatore viene rilasciato fuori dal pulsante o la finestra
  // perde il focus, l'onPressOut del Pressable può non arrivare. Questi
  // listener globali garantiscono che la registrazione venga sempre chiusa.
  useEffect(() => {
    if (Platform.OS !== "web" || (!recording && !starting)) return;
    const win = globalThis as any;
    if (!win?.addEventListener) return;
    // Solo se la pressione è iniziata sul microfono: un click altrove
    // non deve fermare la registrazione.
    const onPointerUp = () => {
      if (pressedRef.current) handlePressOut();
    };
    const onWindowBlur = () => {
      pressedRef.current = false;
      const action = decideWindowBlur({
        starting: startingRef.current,
        recording: recordingRef.current,
      });
      if (action === "markReleasedWhileStarting") {
        // Perdita di focus durante l'avvio (es. prompt permesso in alcune UI):
        // segna l'intenzione di annullare appena l'avvio termina.
        releasedWhileStartingRef.current = true;
      } else if (action === "cancelRecording") {
        cancelRecording();
      }
    };
    win.addEventListener("pointerup", onPointerUp);
    win.addEventListener("blur", onWindowBlur);
    return () => {
      win.removeEventListener("pointerup", onPointerUp);
      win.removeEventListener("blur", onWindowBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, starting]);

  const handlePressIn = () => {
    const action = decidePressIn({
      transcribing,
      lockedByOther,
      disabled: !!disabled,
      starting: startingRef.current,
      recording: recordingRef.current,
    });
    if (action === "ignore") return;
    if (action === "stopAndTranscribe") {
      // Modalità toggle: un nuovo tocco mentre registra ferma e trascrive
      justStoppedRef.current = true;
      stopAndTranscribe();
      return;
    }
    pressedRef.current = true;
    startRecording();
  };

  const handlePressOut = () => {
    pressedRef.current = false;
    const action = decidePressOut({
      isWeb: Platform.OS === "web",
      justStopped: justStoppedRef.current,
      starting: startingRef.current,
      recording: recordingRef.current,
      elapsedMs: Date.now() - recordStartRef.current,
    });
    switch (action) {
      case "clearJustStopped":
        // Rilascio del tocco che ha appena fermato la registrazione: ignora
        justStoppedRef.current = false;
        return;
      case "markReleasedWhileStarting":
        // Nativo, hold-to-talk: il rilascio durante l'avvio annulla appena pronto
        releasedWhileStartingRef.current = true;
        return;
      case "keepRecording":
        // Web, modalità toggle: tap breve → la registrazione continua,
        // un secondo tap la fermerà. Solo il blur della finestra annulla.
        return;
      case "cancelRecording":
        // Nativo: tocco troppo breve → annulla in silenzio, come WhatsApp.
        cancelRecording();
        return;
      case "stopAndTranscribe":
        // Stile WhatsApp: al rilascio si ferma SEMPRE e si trascrive.
        stopAndTranscribe();
        return;
      case "ignore":
        return;
    }
  };

  if (transcribing) {
    return <ActivityIndicator size="small" color={colors.primary} style={styles.button} testID="voice-transcribing" />;
  }

  const isDisabled = disabled || lockedByOther;

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      hitSlop={8}
      style={[styles.button, webHoldStyle]}
      accessibilityLabel={
        recording
          ? Platform.OS === "web"
            ? "Tocca di nuovo per trascrivere"
            : "Rilascia per trascrivere"
          : Platform.OS === "web"
            ? "Tocca e parla"
            : "Tieni premuto e parla"
      }
      testID="voice-input-button"
    >
      {starting && !recording ? (
        // Avvio in corso (permessi/preparazione): il microfono NON sta ancora
        // registrando. Lo spinner dice all'utente di aspettare l'icona rossa
        // prima di parlare, così la prima parola non viene tagliata.
        <ActivityIndicator size="small" color={colors.primary} testID="voice-starting" />
      ) : (
        <Animated.View style={recording ? { transform: [{ scale: pulseAnim }] } : undefined}>
          <Ionicons
            name={recording ? "radio-button-on" : "mic-outline"}
            size={recording ? size + 4 : size}
            color={recording ? "#FF6B6B" : isDisabled ? colors.textSecondary : colors.primary}
          />
        </Animated.View>
      )}
      {recording ? (
        <Animated.Text style={[styles.recLabel, { opacity: pulseAnim.interpolate({ inputRange: [1, 1.35], outputRange: [0.55, 1] }) }]}>
          REC
        </Animated.Text>
      ) : null}
    </Pressable>
  );
}
/**
 * Legge un testo ad alta voce in italiano (interrompe eventuali letture in corso).
 * Utile per leggere automaticamente i risultati generati dall'AI.
 */
export function speakText(text: string) {
  const content = (text || "").trim();
  if (!content) return;
  Speech.stop();
  chunkText(content).forEach((chunk) => {
    Speech.speak(chunk, { language: "it-IT" });
  });
}

/** Divide un testo lungo in blocchi pronunciabili (limite TTS Android ~4000 caratteri). */
function chunkText(text: string, maxLen = 3500): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(". ", maxLen);
    if (cut < maxLen / 2) cut = rest.lastIndexOf(" ", maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

interface SpeakButtonProps {
  /** Testo da leggere ad alta voce (in italiano). */
  text: string;
  size?: number;
  color?: string;
}

/**
 * Pulsante altoparlante: legge il testo ad alta voce (expo-speech, it-IT).
 * Tocca di nuovo per fermare la lettura.
 */
export function SpeakButton({ text, size = 22, color }: SpeakButtonProps) {
  const { colors } = useTheme();
  const [speaking, setSpeaking] = useState(false);

  // Ferma la lettura se il componente viene smontato (cambio schermata)
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handlePress = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const content = (text || "").trim();
    if (!content) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Interrompe eventuali letture in corso (es. lettura automatica) per
    // evitare voci sovrapposte.
    Speech.stop();
    const chunks = chunkText(content);
    setSpeaking(true);
    chunks.forEach((chunk, i) => {
      const isLast = i === chunks.length - 1;
      Speech.speak(chunk, {
        language: "it-IT",
        ...(isLast
          ? {
              onDone: () => setSpeaking(false),
              onStopped: () => setSpeaking(false),
              onError: () => setSpeaking(false),
            }
          : {}),
      });
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={styles.button}
      accessibilityLabel={speaking ? "Ferma la lettura" : "Leggi ad alta voce"}
      testID="speak-button"
    >
      <Ionicons
        name={speaking ? "stop-circle" : "volume-high-outline"}
        size={size}
        color={speaking ? "#FF6B6B" : color || colors.primary}
      />
    </Pressable>
  );
}

// Web/touch: senza questi stili il browser interpreta la pressione prolungata
// come scroll o selezione testo e annulla il tocco ("tocco troppo breve").
const webHoldStyle =
  Platform.OS === "web"
    ? ({
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as any)
    : null;

const styles = StyleSheet.create({
  button: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  recLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FF6B6B",
    letterSpacing: 1,
    marginTop: 1,
  },
});
