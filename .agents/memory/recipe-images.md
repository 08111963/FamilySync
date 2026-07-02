---
name: Foto ricette AI
description: Convenzioni per le immagini generate dall'AI per le ricette (cache pubblica, quota, validazione)
---

# Foto ricette AI

- **Decisione:** le foto delle ricette generate dall'AI sono asset PUBBLICI serviti da `/uploads/recipe-images/` (montato PRIMA di `/uploads` autenticato). Cache su disco condivisa cross-family, chiave = sha256 del titolo normalizzato (NFKD, lowercase, solo alfanumerico).
  - **Why:** sono immagini generiche di piatti, nessun dato personale; la cache condivisa evita di rigenerare (e pagare) la stessa foto per famiglie diverse.
  - **How to apply:** qualsiasi nuovo asset AI generico può usare lo stesso pattern; asset con dati personali devono restare sotto `/uploads` autenticato (authenticateMedia).
- Cache-hit NON consuma quota; solo la generazione reale passa da withAiUsage (feature `recipe-image`).
- Dedup in-flight: la Map condivide la promise del run del leader coi follower, così ricevono l'esito reale (ok/limited/unavailable/errore) — mai un fallback fisso 502.
- Le immagini vengono ottimizzate con sharp (512px, WebP q80, ~35KB da un PNG 1024px da 1.5MB) prima della scrittura atomica (tmp+rename).
- Gli imageUrl salvati in DB sono validati con regex whitelist sul path relativo `/uploads/recipe-images/…` — mai URL arbitrari.
- Lezione IDOR: ogni rotta che accetta `familyId` nel body DEVE avere `requireFamilyMember()` (supporta già il fallback body oltre al param di path).
