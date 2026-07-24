---
name: ZIP di consegna pulito
description: Come generare lo ZIP di consegna del progetto senza segreti e con scansione anti-leak
---

Usare sempre `scripts/export-consegna.sh` per gli ZIP di consegna.

**Regole:**
- Esclude per nome: `.env*`, `.replit`, chiavi (`*.pem/.key/.p8/.p12/.jks`), `*vapid*`, PDF tester, upload, build (`web-build/`, `static-build/`, `server_dist/`, `dist/`), `attached_assets/`, `.local/`, `.agents/`, ZIP precedenti.
- Doppia scansione post-zip: (1) nomi file sensibili nell'indice ZIP, (2) contenuti (BEGIN PRIVATE KEY, valori di SECRET/TOKEN/API_KEY). Se trova qualcosa, elimina lo ZIP ed esce 1.

**Why:** in una consegna precedente erano finiti nel repo la chiave privata VAPID (in `.replit`) e il PDF password tester; il brief privacy v2.1-bis impone ZIP senza segreti.

**How to apply:** qualsiasi richiesta di "ZIP di consegna/consegna del progetto" → usare/aggiornare questo script, mai `zip -r` a mano. Attenzione ai falsi positivi tipo `.replit_integration_files/` (sorgenti legittimi).
