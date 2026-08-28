---
name: Attesa build EAS remota
description: Evitare che il timeout della shell annulli una build EAS ancora in coda.
---

Avviare le build EAS dall'ambiente agente con `--no-wait` e verificarne lo stato separatamente tramite l'ID della build.

**Why:** il timeout del processo CLI in attesa può inviare l'annullamento anche alla build remota ancora in coda, lasciando nessun log né artefatto da verificare.

**How to apply:** dopo l'upload, acquisire l'ID EAS e interrogare periodicamente `eas build:view <id> --json` fino a `FINISHED`, `ERRORED` o `CANCELED`; non terminare il processo CLI che usa l'attesa integrata. L'URL dell'artefatto può apparire mentre lo stato è ancora `IN_PROGRESS`: attendere comunque `FINISHED` prima di scaricare o validare.