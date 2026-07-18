---
name: Ricorrenza faccende
description: Formato recurrenceRule esteso, ricreazione al completamento, guardia atomica
---

- `chores.recurrenceRule` usa il formato di `shared/chore-recurrence.ts`: `daily` | `daily:1,3,5` (ISO 1=lun..7=dom) | `weekly[:d]` | `monthly[:n]`; retro-compatibile con i valori storici semplici. Parsing severo: parametri malformati/fuori range ⇒ regola invalida (rifiutata dallo zod refine lato server).
- **Why:** l'utente sceglie i giorni (giornaliera→più giorni, settimanale→giorno, mensile→giorno del mese); prima la ricorrenza era solo un'etichetta senza effetto.
- **How to apply:** al completamento la route `/complete` fa UPDATE atomico con guardia `isCompleted=false` nella WHERE (evita doppi punti/doppie ricreazioni in concorrenza) e poi INSERISCE la prossima occorrenza (base = max(scadenza, oggi in Europe/Rome), clamp fine mese) con sync calendario. La response di `/complete` è `{...chore, nextChore}` — i client attuali non leggono il body, ma è un cambio di contratto da ricordare. Etichette UI via `recurrenceLabel()`.
