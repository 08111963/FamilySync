---
note-added: Il QR "Try on device" di Replit punta al dominio replit.dev (porta 80 -> backend 5000), NON al tunnel: in dev il backend DEVE inoltrare le richieste con header expo-platform a Metro (127.0.0.1:8082), altrimenti Expo Go riceve 404 e mostra "Failed to download remote update". Fallback al manifest statico se Metro è giù.
name: Anteprima dev — instradamento porte
description: La porta esterna 80 dell'anteprima deve puntare al backend 5000; Metro orfano su 8081 serve bundle vecchi e rompe l'OAuth
---
- La porta esterna 80 (dominio anteprima $REPLIT_DEV_DOMAIN) è mappata sul BACKEND 5000, come in prod. **Mai** rimappare 80→8081 (Metro).
- **Why:** un processo `expo start` orfano su 8081 serviva un bundle dev stantio e rispondeva 200 (SPA) a `/api/auth/google/start`, facendo sembrare rotto il login Google e "vanificando" ogni fix (12 ago 2026).
- **How to apply:** NON modificare il mapping ports in .replit: la piattaforma (stack EXPO) lo rigenera a ogni riavvio riportando 80→8081. Soluzione stabile: `scripts/preview-proxy.cjs` (lanciato da `scripts/expo-tunnel.sh`, workflow "Start Frontend") ascolta su 8081 e inoltra tutto (HTTP+WebSocket) al backend 5000; Metro gira su 8082 solo per il tunnel Expo Go. Se l'anteprima dà 502 o mostra UI vecchia: verificare che "Start Frontend" giri e `curl https://$REPLIT_DEV_DOMAIN/api/health` risponda JSON.
- Login Google sul web = redirect a pagina intera (niente popup: bloccato/perso da vari browser); dentro iframe (anteprima Replit) Google non può comparire → l'app apre una nuova scheda con avviso.
