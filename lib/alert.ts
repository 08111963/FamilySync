import { Alert, Platform } from "react-native";

/**
 * Alert cross-platform: su nativo usa Alert.alert (invariato), sul web usa
 * window.alert, perché react-native-web NON implementa Alert.alert (no-op):
 * senza questo helper gli errori sul sito web sono invisibili all'utente.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof globalThis.alert === "function") {
      globalThis.alert(text);
    } else {
      console.error(`[alert] ${text}`);
    }
    return;
  }
  Alert.alert(title, message);
}
