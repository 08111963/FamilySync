import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Preferenza globale (per dispositivo): se l'AI deve leggere ad alta voce
// automaticamente ricette e piani pasto generati con la voce.
// Default: attiva, per non cambiare il comportamento esistente.

const STORAGE_KEY = "@familysync/autoSpeak";

let autoSpeak = true;
let hydrated = false;
// Se l'utente cambia la preferenza prima che l'hydration da AsyncStorage
// risolva, la risposta tardiva NON deve sovrascrivere la scelta locale.
let userHasSet = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// Carica la preferenza salvata all'avvio (una sola volta).
AsyncStorage.getItem(STORAGE_KEY)
  .then((value) => {
    if (!userHasSet && value !== null) {
      autoSpeak = value === "true";
    }
    hydrated = true;
    emit();
  })
  .catch(() => {
    hydrated = true;
  });

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return autoSpeak;
}

/** Valore corrente della preferenza, utilizzabile fuori da un componente. */
export function getAutoSpeak() {
  return autoSpeak;
}

/** Se la preferenza è stata caricata da AsyncStorage. */
export function isAutoSpeakHydrated() {
  return hydrated;
}

export function setAutoSpeak(value: boolean) {
  userHasSet = true;
  autoSpeak = value;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, value ? "true" : "false").catch(() => {});
}

/**
 * Hook per leggere/impostare la preferenza "lettura vocale automatica".
 * Restituisce il valore corrente, un setter e un toggle.
 */
export function useAutoSpeak() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    autoSpeak: value,
    setAutoSpeak,
    toggleAutoSpeak: () => setAutoSpeak(!getAutoSpeak()),
  };
}
