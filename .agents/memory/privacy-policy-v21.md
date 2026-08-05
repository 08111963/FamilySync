---
name: Privacy Policy v2.1 / consensi GDPR
description: Convenzioni della revisione privacy 2.1 — fonte unica versione, opt-in AI, registro consensi, formulazione DPA
---
- Versione/data policy da `shared/policy-version.ts` (unica fonte per web + app). I Termini hanno una data PROPRIA (30 giugno 2026) passata come parametro a htmlWrapper — non riusare la data privacy.
- **Regola:** consenso AI opt-in fail-closed a TUTTI i livelli: checkbox mai preselezionata, default DB `ai_features_enabled=false` (migrazione 0015), guard server per under14.
- Registro consensi `consent_records`: fail-safe al signup, ma `strict:true` in transazione per il toggle AI (se il registro non scrive, il toggle si annulla).
- **Perché:** la policy dichiara opt-in e retention 30gg; il codice non deve mai poter superare quanto dichiarato (architect review lo ha segnalato come FAIL).
- Formulazione fornitori: MAI dichiarare DPA "in essere" (OpenAI in firma); usare "ove richiesto". Titolare trattamento = "FamilySync", ma proprietà intellettuale nei Termini = "Marino Pizzuti / FamilySync" (i test lo verificano).
- Migrazioni 0014+0015 da applicare al DB di PRODUZIONE dopo il Republish.
- v2.2 (5 ago 2026): sezione dedicata "Sincronizzazione con Google Calendar" richiesta dalla verifica OAuth Google — deve citare refresh token cifrato, email account, scrittura/aggiornamento/cancellazione eventi, no lettura eventi altrui, revoca (in-app + myaccount.google.com/permissions) e Limited Use della Google API Services User Data Policy. Rinumerate le sezioni successive; test policy-source verifica contenuto e conteggio sezioni.
