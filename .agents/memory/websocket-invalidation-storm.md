---
name: WebSocket invalidation storm
description: Perché i broadcast per-riga + invalidazioni per-messaggio fanno scattare il rate limiter globale e svuotano le liste
---

Regola: qualsiasi rotta che inserisce N righe in batch (es. occorrenze ricorrenti materializzate) deve fare UN solo broadcast WebSocket per operazione, mai uno per riga. Lato client `useWebSocket.invalidateFamily` è debounced (400ms) e il timer va pulito nell'unmount.

**Why:** creare un evento ricorrente (≈53 righe) generava 53 `event_created`; ogni messaggio invalidava 4 query → 200+ GET in raffica → rate limiter globale `/api` (100/15min) → 429 su `/api/calendar` → il calendario mostrava "Nessun evento" pur con i dati corretti nel DB. Sintomo ingannevole: sembrava un bug dell'AI/ricorrenza.

**How to apply:** nei nuovi broadcast batch (calendario, faccende, bollette) emettere un solo evento riassuntivo; i client ricaricano comunque l'intera lista. Se compaiono 429 su GET di liste dopo un'azione, sospettare una raffica di messaggi realtime prima di toccare la logica dati.
