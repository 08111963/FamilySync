---
name: Test analytics temporanea
description: convenzioni analytics interna di test (flag, owner allowlist, privacy)
---
Funzione TEMPORANEA di analytics interna (tabella test_analytics_events).
- **Regola**: il middleware del flag ENABLE_TEST_ANALYTICS va montato PRIMA di authenticate: con flag off tutti gli endpoint rispondono 404 anche a richieste non autenticate (endpoint "non esposto").
- **Why:** spec utente richiede che a flag spento la funzione sia invisibile; con authenticate prima si otterrebbe 401 e l'endpoint risulterebbe rilevabile.
- **How to apply:** pannello solo per email in APP_OWNER_EMAILS (riletta dal DB + emailVerified, mai dal token); eventi/metadata a whitelist (mai contenuti personali); retention 30 giorni con prune opportunistico; client fire-and-forget silenzioso che si disattiva per sessione su 404. Per rimuovere tutto: flag a false o eliminare rotte/tabella.
