---
name: Push notifications (FamilySync)
description: Convenzioni push Expo: dove funzionano, esclusione blocchi, rebind token per utente
---

- Le push remote funzionano SOLO nella build nativa da store: guardie client `Platform.OS==='web'` e `Constants.executionEnvironment===StoreClient` (Expo Go SDK53+ crasha su getExpoPushTokenAsync).
- **Regola blocchi:** OGNI nuovo hook push server-side (family-wide o diretto) deve escludere gli utenti in blocco reciproco con l'autore via `getBlockRelatedUserIds` — non solo la chat. **Why:** altrimenti le notifiche rivelano attività a utenti bloccati (leak segnalato in review).
- **Rebind token:** la cache locale del token salva `{token,userId}` e si salta la registrazione solo se ENTRAMBI coincidono; `clearAuth` rimuove la cache. **Why:** al cambio account senza logout esplicito il token resterebbe associato al vecchio utente (notifiche al profilo sbagliato).
- projectId EAS: usare fallback `Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId` (nelle build reali expoConfig.extra può mancare).
- Promemoria bollette restano notifiche LOCALI (lib/bill-notifications.ts): nessuno scheduler push server-side.
