---
name: Consolidamento lista spesa da piano pasti
description: Regole per accorpare ingredienti AI quasi-duplicati e saltare la dispensa nella conversione piano pasti → lista spesa.
---

La dedup sul nome normalizzato esatto NON basta: l'AI scrive lo stesso ingrediente con note ("olio EVO (insalata)", "per condire"), singolare/plurale, aggettivi.

Regole (server/lib/consolidate-ingredients.ts):
- Chiave canonica: via parentesi, testo dopo la virgola, SOLO note di servizio esplicite ("per condire/servire/decorare…") — mai un generico "per …" (farina per dolci ≠ farina); rimozione aggettivi descrittivi; troncamento vocali finali per singolare/plurale.
- Quantità: sommate per famiglia di unità (kg→g, l→ml, sinonimi pezzo/pz→pcs); unità NON compatibili = voci separate, mai quantità scartate.
- "q.b." assorbito solo se esiste una voce numerica dello stesso prodotto.

**Why:** una lista da piano settimanale conteneva 111 voci con l'olio ripetuto; una prima versione che scartava le unità incompatibili perdeva quantità (bocciata in review).

**How to apply:** la conversione to-shopping-list consolida, poi salta ciò che è già in dispensa (stessa chiave canonica) restituendo `skippedFromPantry` mostrato all'utente; supporta lista per singolo giorno via body `{date}`. Gli ingredienti delle ricette vanno sempre letti con join su recipes.familyId (difesa cross-family).
