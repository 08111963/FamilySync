---
name: Privacy Policy v2.1 / consensi GDPR
description: Convenzioni della Privacy Policy — fonte unica, accettazione Policy/Termini, AI e allergie, formulazione DPA
---
- Versione/data policy da `shared/policy-version.ts` (unica fonte per web + app). I Termini hanno una data PROPRIA (30 giugno 2026) passata come parametro a htmlWrapper — non riusare la data privacy.
- **Regola:** Privacy Policy e Termini restano accettati esplicitamente; AI e allergie/intolleranze sono sempre disponibili per gli account idonei, senza checkbox o toggle separati. I profili sotto i 14 anni restano bloccati lato server.
- Registro `consent_records`: conserva l'accettazione dei Termini e lo storico legacy; non deve esporre nuovi toggle AI/allergie.
- **Perché:** il prodotto non offre più una scelta separata per AI o allergie, quindi UI, policy e guard server devono dichiarare e applicare la stessa regola.
- Formulazione fornitori: MAI dichiarare DPA "in essere" (OpenAI in firma); usare "ove richiesto". Titolare trattamento = "FamilySync", ma proprietà intellettuale nei Termini = "Marino Pizzuti / FamilySync" (i test lo verificano).
- Migrazioni 0014+0015 da applicare al DB di PRODUZIONE dopo il Republish.
- v2.2 (5 ago 2026): sezione dedicata "Sincronizzazione con Google Calendar" richiesta dalla verifica OAuth Google — deve citare refresh token cifrato, email account, scrittura/aggiornamento/cancellazione eventi, no lettura eventi altrui, revoca (in-app + myaccount.google.com/permissions) e Limited Use della Google API Services User Data Policy. Rinumerate le sezioni successive; test policy-source verifica contenuto e conteggio sezioni.
