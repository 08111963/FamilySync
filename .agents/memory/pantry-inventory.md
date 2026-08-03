---
name: Dispensa (pantry inventory)
description: Convenzioni della feature Dispensa — dedup atomico via ON CONFLICT, integrazione AI, validazioni.
---

# Dispensa / inventario

- Dedup: vincolo univoco `(family_id, normalized_name, COALESCE(unit,''))` (migrazione 0010) + upsert atomico `ON CONFLICT DO UPDATE` (somma quantità, `LEAST` sulle scadenze). MAI select-then-insert: richieste concorrenti da più device creavano duplicati.
- `(xmax = 0) AS inserted` nel RETURNING distingue insert da merge senza query extra.
- Rinomina via PUT può violare il vincolo univoco → mappare errore Postgres 23505 su 409 DUPLICATE_ITEM.
- Item spuntato in lista spesa → addToPantry best-effort (non blocca il toggle) + broadcast `pantry_updated`.
- AI: nomi dispensa entrano nel forbiddenSet dei suggerimenti spesa (prompt E filtro post-AI con normalizeItemName) e come `pantryIngredients` prioritari nelle ricette.
- Validazione: unit enum condiviso (pcs/g/kg/ml/l), expiryDate validata come data reale (non solo regex) per evitare 500 da date tipo 2026-99-99.
- Client: input data in formato italiano GG/MM/AAAA convertito a ISO lato client (parseItalianDate in app/pantry.tsx).
- Migrazioni 0009 + 0010 da applicare a prod dopo il publish.

## Indice a espressione: drizzle push NON lo porta in prod
L'indice univoco `(family_id, normalized_name, COALESCE(unit,''))` è un indice a espressione: `drizzle-kit push` (usato dal Republish per sincronizzare lo schema prod) non sa crearlo, quindi in produzione mancava e ogni upsert ON CONFLICT della dispensa falliva ("no unique or exclusion constraint..."), dispensa sempre vuota.
**Why:** bug reale in prod (ago 2026) scoperto dai log deployment; i 4 pantry_items prod erano di prima del vincolo.
**How to apply:** l'indice viene garantito all'avvio del server (server/lib/ensure-pantry-schema.ts, await prima del listen, fail-fast in prod, advisory lock cross-istanza). Qualsiasi futuro indice a espressione/parziale deve avere lo stesso bootstrap: mai fidarsi del solo drizzle push.
