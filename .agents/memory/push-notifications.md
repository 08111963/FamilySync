---
name: Push notifications (FamilySync)
description: Convenzioni push Expo + web push VAPID, esclusione blocchi, rebind token, promemoria bollette server-side
---

- Le push remote NATIVE funzionano SOLO nella build da store: guardie client `Platform.OS==='web'` e `Constants.executionEnvironment===StoreClient` (Expo Go SDK53+ crasha su getExpoPushTokenAsync).
- **Web push (PWA):** su web si usa VAPID (`web-push` lib, env VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT condivise). Service worker in `public/sw.js` (Expo export lo copia in web-build → riesportare dopo modifiche). Sottoscrizioni in tabella `web_push_subscriptions`; `sendPushToFamily/ToUser` inviano SIA a token Expo SIA a sub web; sub scadute rimosse su 404/410.
- **Anti-SSRF obbligatorio:** l'endpoint di subscribe web è un URL a cui il server fa richieste in uscita → allow-list rigida di host push noti (googleapis/apple/mozilla/windows), solo https. **Why:** senza allow-list un utente autenticato fa chiamare al backend host interni.
- **Regola blocchi:** OGNI nuovo hook push server-side con un autore deve escludere gli utenti in blocco reciproco via `getBlockRelatedUserIds`. **Why:** altrimenti le notifiche rivelano attività a utenti bloccati.
- **Rebind:** token nativi e endpoint web sono unici per dispositivo/browser; al cambio account l'upsert riassocia al nuovo userId; `clearAuth` pulisce la cache locale.
- projectId EAS: fallback `Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId`.
- **Promemoria bollette server-side:** scheduler orario (`server/lib/bill-reminders.ts`) per email (membri con email verificata) + push a bollette non pagate in scadenza oggi/domani (Europe/Rome). Dedup con claim atomico ON CONFLICT su `bill_reminder_log`; se l'invio fallisce del tutto il claim viene RILASCIATO per ritentare. **Why:** claim-prima-dell'invio senza rilascio perde promemoria per sempre (rilevato in review). Le notifiche locali client restano come complemento.
- Migrazione 0013 (web_push_subscriptions + bill_reminder_log) da applicare in PROD dopo il deploy.

## Notifica di prova (owner-only)
- Pulsante web "Invia notifica di prova" gated via endpoint /access + APP_OWNER_EMAILS (404 ai non owner, come test-analytics); invia SOLO all'endpoint del browser corrente verificando che appartenga all'utente; rate limit per-utente dedicato.
