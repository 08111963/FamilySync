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

Per un archivio eccezionalmente limitato a un manifest, lo staging deve processare
anche l'ultima riga quando il file manifest non termina con newline; dopo la
creazione confrontare sempre l'indice ZIP con il manifest ordinato.

**Why:** un ciclo `while read` standard può saltare proprio l'ultimo file in un
manifest senza newline, lasciando un archivio apparentemente valido ma incompleto.

**How to apply:** usare `while IFS= read -r file || [ -n "$file" ]` e verificare
`unzip -Z1` contro il manifest prima della scansione dei contenuti.
