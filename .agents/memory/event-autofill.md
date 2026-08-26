---
name: Compilazione automatica evento (AI)
description: Convenzioni per il parse-event AI (testo libero → campi evento calendario)
---

# Compilazione automatica evento

- Rotta `POST /api/ai/:familyId/parse-event`: pattern standard AI (authenticate + requireAiEnabled + requireFamilyMember + withAiUsage, feature `event-parse`, quote in PLAN_LIMITS free 3/day, premium 40/day).
- `parseEventFromText` (gpt-5-mini, json_object) risolve date relative italiane passando `todayIso` + `weekdayName` calcolati con timeZone Europe/Rome (`toLocaleDateString('en-CA')` per YYYY-MM-DD).
- **Regola anti falso-successo**: se l'AI non estrae NESSUN campo utile, lanciare `AiError('AI_BAD_RESPONSE')` invece di rispondere 200 vuoto; il client inoltre mostra successo solo se almeno un campo è stato compilato.
- **Why:** schema zod con `.catch()` su ogni campo accetta `{}` silenziosamente → il bottone "Compila" sembrerebbe funzionare senza fare nulla (blocker trovato dall'architect).
- **How to apply:** ogni futura feature "AI compila form" deve validare che la risposta contenga almeno un campo utilizzabile lato server e gestire il no-op lato client.

**Data di default (ago 2026):** i modelli tendevano a restituire la data di OGGI quando il testo aveva solo l'orario, sovrascrivendo il giorno preselezionato dal calendario (bug reale in prod). Regola nei prompt parse-event/parse-chore: date/dueDate DEVE essere null se il testo non menziona esplicitamente una data — mai oggi come default. Se si tocca il prompt, ritestare il caso "evento alle 16" (senza data) → date null.

**Modifica vocale:** nella schermata di modifica una nuova trascrizione deve
sostituire l'istruzione vocale precedente; la concatenazione è appropriata solo
quando si sta creando un nuovo evento.

**Why:** concatenare due comandi di modifica fa interpretarli come un'unica
descrizione e può trasformare una sostituzione in un'aggiunta ambigua.

**How to apply:** distinguere sempre il modo creazione dal modo modifica prima
di comporre il testo inviato a parse-event.
