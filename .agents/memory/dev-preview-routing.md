---
name: Anteprima dev — instradamento porte
description: La porta esterna 80 dell'anteprima deve puntare al backend 5000; Metro orfano su 8081 serve bundle vecchi e rompe l'OAuth
---
- La porta esterna 80 (dominio anteprima $REPLIT_DEV_DOMAIN) è mappata sul BACKEND 5000, come in prod. **Mai** rimappare 80→8081 (Metro).
- **Why:** un processo `expo start` orfano su 8081 serviva un bundle dev stantio e rispondeva 200 (SPA) a `/api/auth/google/start`, facendo sembrare rotto il login Google e "vanificando" ogni fix (12 ago 2026).
- **How to apply:** se l'anteprima mostra UI vecchia o le rotte /api rispondono HTML: `curl -D - https://$REPLIT_DEV_DOMAIN/api/health` (deve essere JSON dal backend), controllare `ss -ltnp | grep 8081` e uccidere Metro orfani; verificare il mapping ports in .replit.
- Login Google sul web = redirect a pagina intera (niente popup: bloccato/perso da vari browser); dentro iframe (anteprima Replit) Google non può comparire → l'app apre una nuova scheda con avviso.
