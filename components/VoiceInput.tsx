import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, ActivityIndicator, Alert, Platform, StyleSheet } from "react-native";
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
}

/**
 * Pulsante microfono per la dettatura vocale.
 * Tocca per registrare, ritocca per fermare: l'audio viene trascritto in testo
 * dal backend (OpenAI) e passato a onTranscribed.
 */
export function VoiceInput({ familyId, onTranscribed, size = 22, disabled }: VoiceInputProps) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const idRef = useRef(`mic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const recordingRef = useRef(false);

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

  const startRecording = async () => {
    if (getActiveMic() !== null) return; // un altro mic sta già registrando
    setActiveMic(idRef.current);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setActiveMic(null);
        Alert.alert(
          "Microfono non disponibile",
          "Per usare la dettatura vocale, consenti l'accesso al microfono nelle impostazioni del dispositivo."
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (err) {
      console.error("Errore avvio registrazione:", err);
      recordingRef.current = false;
      setRecording(false);
      setActiveMic(null);
      await resetAudioMode();
      Alert.alert("Dettatura", "Impossibile avviare la registrazione su questo dispositivo.");
    }
  };

  const stopAndTranscribe = async () => {
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

      const res = await apiUpload<{ text: string }>(`/api/ai/${familyId}/transcribe`, formData);
      const text = (res.text || "").trim();
      if (text) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        onTranscribed(text);
      } else {
        Alert.alert("Dettatura", "Non ho sentito nulla. Riprova parlando più vicino al microfono.");
      }
    } catch (err) {
      console.error("Errore trascrizione:", err);
      Alert.alert("Dettatura", aiErrorMessage(err, "Impossibile trascrivere l'audio. Riprova."));
    } finally {
      setTranscribing(false);
      setActiveMic(null);
    }
  };

  const handlePress = () => {
    if (transcribing || lockedByOther) return;
    if (recording) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  };

  if (transcribing) {
    return <ActivityIndicator size="small" color={colors.primary} style={styles.button} testID="voice-transcribing" />;
  }

  const isDisabled = disabled || lockedByOther;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      hitSlop={8}
      style={styles.button}
      accessibilityLabel={recording ? "Ferma la registrazione" : "Detta con la voce"}
      testID="voice-input-button"
    >
      <Ionicons
        name={recording ? "stop-circle" : "mic-outline"}
        size={recording ? size + 4 : size}
        color={recording ? "#FF6B6B" : isDisabled ? colors.textSecondary : colors.primary}
      />
    </Pressable>
  );
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

const styles = StyleSheet.create({
  button: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
