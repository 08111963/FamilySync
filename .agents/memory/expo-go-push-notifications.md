---
name: Expo Go push notifications crash (SDK 53+)
description: Perché l'app crasha solo in Expo Go / "Simulate on Android" e come va guardata la registrazione push.
---

# expo-notifications crasha in Expo Go (SDK 53+)

Da Expo SDK 53 le **notifiche push remote** sono state rimosse da Expo Go (Android). Chiamare `getExpoPushTokenAsync` / `getDevicePushTokenAsync` lancia un errore fatale ("Android Push notifications ... was removed from Expo Go") che fa apparire la schermata "Something went wrong" **solo** dentro Expo Go / la preview "Simulate on Android" del Canvas. Web (servito da Express su :5000) e build/dev-build vere NON sono toccate.

**Sintomo ingannevole**: lo screenshot `app_preview` punta a `localhost:5000` (web build via Express) e mostra l'app sana, mentre il Canvas "Simulate on Android" (Expo Go, Metro :8081) crasha. Non confondere i due ambienti.

**Fix**: in `hooks/usePushNotifications.ts`, prima di registrare il token push uscire subito se si è in Expo Go:
`Constants.executionEnvironment === ExecutionEnvironment.StoreClient` (import da `expo-constants`). Le **notifiche locali** (`scheduleNotificationAsync`, `setNotificationHandler`) restano OK in Expo Go: guardare solo la parte push remota.

**Why**: il try/catch attorno alla chiamata non basta a evitare la schermata d'errore in dev — l'errore nativo emerge comunque; va impedita la chiamata stessa in Expo Go.

**How to apply**: per testare push remote serve un dev build, non Expo Go. Per verificare la fix nel Canvas, ricaricare la preview "Simulate on Android" (il log file resta cumulativo: i vecchi ERROR con timestamp precedenti alla modifica sono stale).
