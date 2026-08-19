---
name: API native Expo Go
description: Distinguere Expo Go dal browser web quando si costruisce la base URL dell'API.
---

In una build Expo Go, non usare la sola presenza di `window.location` per dedurre che l'app sia sul web: Expo espone la location del dev server/tunnel anche sul dispositivo.

**Why:** il client finirebbe per chiamare il tunnel Metro, che restituisce HTML invece delle risposte JSON dell'API; il sintomo lato login è un errore di parsing JSON con il carattere `<`.

**How to apply:** selezionare l'origine corrente solo quando `Platform.OS === "web"`; per iOS/Android usare sempre il dominio backend pubblicamente raggiungibile, senza la porta interna del server.