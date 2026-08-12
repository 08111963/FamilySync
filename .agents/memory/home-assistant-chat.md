---
name: Assistente AI Home
description: Chat 🤖 in Home che smista testo/dettato in azioni multiple — architettura e vincoli
---
- Parse su server (`/api/ai/:familyId/assistant-parse`, feature quota `assistant-parse`); l'ESECUZIONE avviene dal client chiamando le rotte di creazione ESISTENTI (calendar/chores/shopping/bills/rewards/meal-plans).
- **Why:** riusare le rotte esistenti mantiene identici notifiche, validazioni, permessi e ricorrenze senza duplicare logica server.
- **How to apply:** nuove sezioni supportate dall'assistente = aggiungere la lista al prompt/schema in `parseAssistantActionsFromText` e il ramo di esecuzione client; MAI creare un endpoint "execute" che reinserisce a mano.
- Vincoli di mapping: shopping unit enum `pcs/g/kg/ml/l`; bills category enum italiano (`luce`,`gas`,...) e dueDate obbligatoria (default +7gg mostrato nel riepilogo); meal-plans richiede weekStartDate = lunedì e `titleOverride`; premi solo admin/adult.
- UI: conferma sempre obbligatoria (riepilogo); guardia sincrona `useRef` contro doppio tap su Conferma; FAB nascosto per role child; FAB a bottom ~88px o finisce SOTTO la tab bar (click intercettato — bug trovato dal tester e2e).
- Ogni modifica alle funzioni AI elencate nella privacy policy richiede bump di `shared/policy-version.ts` (v2.4 = assistente, 12 ago 2026).
