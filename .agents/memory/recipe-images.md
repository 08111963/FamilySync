---
name: Foto ricette AI
description: Convenzioni per le immagini generate dall'AI per le ricette (cache pubblica, quota, validazione)
---

# Foto ricette AI

- **Decisione:** le foto delle ricette generate dall'AI sono asset PUBBLICI serviti da `/uploads/recipe-images/` (montato PRIMA di `/uploads` autenticato). Cache su disco condivisa cross-family, chiave = sha256 del titolo normalizzato (NFKD, lowercase, solo alfanumerico).
  - **Why:** sono immagini generiche di piatti, nessun dato personale; la cache condivisa evita di rigenerare (e pagare) la stessa foto per famiglie diverse.
  - **How to apply:** qualsiasi nuovo asset AI generico può usare lo stesso pattern; asset con dati personali devono restare sotto `/uploads` autenticato (authenticateMedia).
- Persistenza prod: con STORAGE_MODE=object-storage le foto vanno nel bucket (chiave `uploads/recipe-images/...`) via persistUploadedFile subito dopo sharp; il check di cache è disco→Set in-memory positiva→bucket exists (le foto sono immutabili per chiave, quindi la cache positiva non scade). Se il check bucket fallisce: resolve degrada a "non in cache", il prewarm SALTA il titolo (mai generazione duplicata su errore di check).
- Cache-hit NON consuma quota; solo la generazione reale passa da withAiUsage (feature `recipe-image`).
- Perf liste: esiste una rotta batch di lookup (`recipe-images/resolve`, solo cache-hit, no quota) e il client raggruppa i titoli (~40ms) in UNA chiamata; solo i miss passano alla generazione individuale. Dedup client per (familyId, titolo) — mai solo titolo, l'autorizzazione è per famiglia.
- Dedup in-flight: la Map condivide la promise del run del leader coi follower, così ricevono l'esito reale (ok/limited/unavailable/errore) — mai un fallback fisso 502.
- Le immagini vengono ottimizzate con sharp (512px, WebP q80, ~35KB da un PNG 1024px da 1.5MB) prima della scrittura atomica (tmp+rename).
- Gli imageUrl salvati in DB sono validati con regex whitelist sul path relativo `/uploads/recipe-images/…` — mai URL arbitrari.
- Lezione IDOR: ogni rotta che accetta `familyId` nel body DEVE avere `requireFamilyMember()` (supporta già il fallback body oltre al param di path).
- Header CORP: helmet mette `Cross-Origin-Resource-Policy: same-origin` di default e il browser BLOCCA le `<img>` cross-origin (anteprima Metro su origine diversa → icone rotte, mentre curl risponde 200). I mount pubblici `/uploads/recipe-images` e `/uploads/avatars` devono forzare `cross-origin`; su `/uploads` autenticato resta same-origin.
- Ricette salvate senza `imageUrl` (foto pronta DOPO il salvataggio): il client le mostra con `RecipeAiImage resolveOnly` (solo lookup batch cache, nessuna generazione/quota; null su miss). Mai renderizzare la generazione automatica dalle liste salvate.
- Prewarm in background: dopo i suggerimenti ricette il server pre-genera le foto mancanti (concorrenza 2, fire-and-forget dopo `res.json`). Riusa la stessa Map in-flight (nessun doppio consumo quota) e si FERMA al primo esito limited/unavailable — la quota famiglia vale anche per il prewarm.
