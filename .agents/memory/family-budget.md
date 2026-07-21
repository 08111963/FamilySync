---
name: Budget familiare
description: Convenzioni del modulo Budget (expenses/family_budgets), bollette incluse nel riepilogo, tetto budget, AI budget-insights.
---

# Budget familiare

- **Bollette nel riepilogo**: le bollette pagate NON si registrano come spese; il summary mensile le somma da `bill_payment_history` come categoria calcolata `bollette` (read-only). **Why:** evitare doppi conteggi e doppia digitazione. **How to apply:** qualunque nuova vista "spese totali" deve riusare `getBudgetSummary` in `server/routes/expenses.ts`, non sommare da sola.
- **Tetto budget**: `family_budgets` con `category` NOT NULL default `'total'` e unique `(family_id, category)`; upsert atomico `onConflictDoUpdate`; `monthlyLimit null/<=0` = DELETE (rimozione tetto). Modifica riservata a ruoli admin/adult. L'avviso (>=80% giallo, >=100% rosso) è solo lato client.
- **memberId mai dal client**: la spesa è sempre attribuita a `req.membership.id`; accettare un memberId dal body permette attribuzioni cross-family (bocciato in review). Vale per ogni futura rotta che scrive righe collegate a `family_members`.
- **AI**: feature quota `budget-insights` (free 1/settimana, premium 10/giorno) in `PLAN_LIMITS`; aggiungere una feature richiede di toccare AiFeature + entrambi i piani + `AI_DAILY_LIMITS`. Il server risponde `{insights: [], message}` senza consumare quota se il mese non ha spese.
- **Query param nel queryKey**: il default fetcher fa `queryKey.join("/")`, quindi `?month=YYYY-MM` va incluso nella stessa stringa del segmento (es. `[`/api/expenses/${id}/summary?month=${m}`]`).
