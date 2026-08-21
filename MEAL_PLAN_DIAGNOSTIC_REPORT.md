# FamilySync — Meal Plan Diagnostic Report

## Scopo e confini

Questo documento descrive il percorso del Piano Pasti nel codice incluso
nell'archivio diagnostico. È una mappa di raccolta tecnica per controllo
esterno: non modifica il comportamento dell'app e non propone correzioni.

I riferimenti sono percorsi relativi alla radice del progetto.

## Flusso dati reale

```text
Schermata Piano Pasti
  → body POST JSON
  → /api/ai/:familyId/weekly-meal-plan/stream
  → parsing e consenso AI/salute
  → generateWeeklyMealPlan()
  → prompt + JSON Schema OpenAI
  → parsing Zod + validazione semantica dei vincoli
  → stream NDJSON solo dopo validazione completa
  → salvataggio esplicito su /api/meal-plans/:familyId/meal-plans
  → meal_plans + meal_plan_items
  → caricamento/visualizzazione o conversione in Lista Spesa
```

| Passaggio | Codice principale | Cosa trasporta o controlla |
| --- | --- | --- |
| Input e stato del form | `app/meal-plans/index.tsx` | `weekStart`, `diet`, `allergies`, `voicePrefs`, stato della generazione e dei piani AI. |
| Body di generazione | `app/meal-plans/index.tsx`, `fetchMealPlanStream` e `fetchAlternativeStream` | `{ weekStartDate, preferences?: { diet, allergies, notes }, planVariant? }`. I campi testuali sono inviati solo se non vuoti. |
| Trasporto client | `lib/query-client.ts` | `apiStream` invia il POST autenticato e legge gli oggetti NDJSON `status`, `items`, `done`, `error`. |
| Route AI | `server/routes/ai.ts` | Valida `preferences`, controlla consenso sanitario quando necessario, quota AI, appartenenza alla famiglia e chiama `generateWeeklyMealPlan`. |
| Contesto/Prompt | `server/lib/openai.ts` | Normalizza preferenze, costruisce i messaggi di sistema e utente, seleziona giorni e tipi di pasto, applica correzioni interne di formato/vincoli/varietà. |
| JSON Schema e Zod | `server/lib/openai.ts` | `mealPlanResponseFormat`, `mealPlanIngredientSchema`, `mealItemSchema`, `parseMealItems`. |
| Validazione semantica | `server/lib/meal-plan-constraints.ts` | Classificazione di dieta e dati sanitari, vincoli su ingredienti/titoli/descrizioni/note/passaggi e controllo del piano completo. |
| Risposta al client | `server/routes/ai.ts` | L'endpoint stream accumula e invia il risultato finale validato; non persiste automaticamente il piano generato. |
| Salvataggio | `app/meal-plans/index.tsx`, `server/routes/meal-plans.ts` | Il client invia il piano scelto a `POST /api/meal-plans/:familyId/meal-plans`; la route esegue di nuovo controlli Zod e semantici prima della transazione DB. |
| Persistenza | `shared/schema.ts` | `meal_plans.preferences` conserva il JSON delle preferenze; `meal_plan_items` conserva dati dei pasti, ingredienti e note. |
| Visualizzazione e modifica | `app/meal-plans/index.tsx`, `app/meal-plans/view.tsx`, `app/meal-plans/edit.tsx`, `server/routes/meal-plans.ts` | Query del piano, elenco dei pasti, modifica e sostituzione. |
| Lista Spesa | `app/meal-plans/index.tsx`, `server/routes/meal-plans.ts`, `server/routes/shopping.ts`, `server/lib/shopping-quantity.ts` | L'endpoint `to-shopping-list` usa gli ingredienti già salvati del piano e crea una lista; non richiama OpenAI per sostituire ingredienti. |

## Mappatura campi

La UI corrente ha due campi testuali liberi: **Dieta** e **Allergie**. Non
espone un campo distinto chiamato `intolerances`; un'intolleranza inserita
dall'utente viaggia quindi nel testo di `allergies` oppure, se dettata come
preferenza, nel testo di `notes`.

| Input utente | Campo frontend | Campo API | Campo nel contesto/prompt | Persistito DB |
| ------------ | -------------- | --------- | ------------------------- | ------------- |
| Dieta mediterranea | stato `diet` | `preferences.diet` | preferenze normalizzate in `generateWeeklyMealPlan` | `meal_plans.preferences.diet` |
| Dieta vegetariana | stato `diet` | `preferences.diet` | preferenze normalizzate e controlli vincoli | `meal_plans.preferences.diet` |
| Dieta vegana | stato `diet` | `preferences.diet` | preferenze normalizzate e controlli vincoli | `meal_plans.preferences.diet` |
| Senza glutine scritto nella Dieta | stato `diet` | `preferences.diet` | classificazione dieta/vincolo in `meal-plan-constraints.ts`, poi prompt e validazione | `meal_plans.preferences.diet` |
| Glutine scritto in Allergie | stato `allergies` | `preferences.allergies` | classificazione dati sanitari/vincolo in `meal-plan-constraints.ts`, poi prompt e validazione | `meal_plans.preferences.allergies` |
| Senza lattosio scritto nella Dieta | stato `diet` | `preferences.diet` | classificazione dieta/vincolo in `meal-plan-constraints.ts`, poi prompt e validazione | `meal_plans.preferences.diet` |
| Lattosio scritto in Allergie | stato `allergies` | `preferences.allergies` | classificazione dati sanitari/vincolo in `meal-plan-constraints.ts`, poi prompt e validazione | `meal_plans.preferences.allergies` |
| Altre allergie | stato `allergies` | `preferences.allergies` | vincoli estratti/validati e prompt | `meal_plans.preferences.allergies` |
| Intolleranze | nessun campo dedicato; testo in `allergies` o `notes` | `preferences.allergies` o `preferences.notes` | classificazione/estrazione dei vincoli dalla preferenza ricevuta | `meal_plans.preferences.allergies` o `.notes` |

## Distinzione critica richiesta

- **“Senza glutine” come dieta:** se l'utente lo scrive nel campo Dieta,
  l'origine è `preferences.diet`.
- **“Glutine” come allergia/intolleranza:** se l'utente lo scrive nel campo
  Allergie, l'origine è `preferences.allergies`.
- **“Senza lattosio” come dieta:** se scritto nel campo Dieta, l'origine è
  `preferences.diet`.
- **“Lattosio” come allergia/intolleranza:** può essere inserito nel campo
  Allergie e arriva come `preferences.allergies`.
- **Campo `intolerances`:** non esiste nel form o nello schema
  `mealPlanPreferencesSchema` attuale.
- I due percorsi conservano la chiave originale nel JSON di `meal_plans`, ma
  convergono nella classificazione dei vincoli (`server/lib/meal-plan-constraints.ts`)
  prima della costruzione del prompt e prima della validazione semantica.

## Frontend e percorsi funzionali inclusi

- `app/meal-plans/index.tsx`: tab “I miei piani”, tab di generazione AI,
  input, stream, alternativa, salvataggio e conversione in lista spesa.
- `app/meal-plans/view.tsx`: visualizzazione di un piano salvato.
- `app/meal-plans/edit.tsx`: creazione/modifica manuale, elementi e titolo.
- `app/(tabs)/shopping.tsx` e `app/shopping-list.tsx`: UI della lista spesa.
- `components/AiPrivacyNotice.tsx`, `components/VoiceInput.tsx`,
  `hooks/useAutoSpeak.ts`, `hooks/useTheme.ts`, `context/FamilyContext.tsx`,
  `lib/query-client.ts`, `lib/ai-error-message.ts` e `lib/plan-limit.ts`:
  dipendenze client dirette del percorso.

## API, alternative, salvataggio e lista spesa

- `server/routes/ai.ts` contiene le route `weekly-meal-plan` e
  `weekly-meal-plan/stream`, compreso parsing del body, controllo consenso,
  quota e streaming.
- L'alternativa lato client usa lo stesso endpoint stream, aggiungendo
  `planVariant: 2` e le stesse `preferences`.
- `server/lib/ai-policy.ts` riceve il valore di variante tramite
  `resolveMealPlanVariants`; il file incluso permette di controllare il
  limite applicato.
- `server/routes/meal-plans.ts` contiene CRUD, validazione prima della
  persistenza e `to-shopping-list`.
- `server/routes/shopping.ts` contiene la persistenza e il caricamento delle
  liste spesa. `server/lib/shopping-quantity.ts` documenta le quantità
  usate nella conversione.
- `server/routes/recipes.ts` e le schermate `app/recipes/*` sono incluse
  perché gli elementi manuali del piano possono riferirsi a `recipeId` e
  l'API AI contiene anche suggerimenti di ricette.

## OpenAI, schema e validazione inclusi

- Il Piano Pasti è generato in `server/lib/openai.ts` tramite
  `generateWeeklyMealPlan` e `generateWeeklyMealPlanAttempt`.
- Il modello specificato per queste chiamate è `gpt-5-mini`.
- La risposta usa `response_format` JSON Schema costruito da
  `mealPlanResponseFormat`; il parsing strutturale passa da schemi Zod nello
  stesso file.
- `server/lib/meal-plan-constraints.ts` contiene sia la classificazione dei
  vincoli sia la validazione semantica su tutti i campi della ricetta.
- `server/lib/ai-errors.ts` contiene i codici/messaggi di errore e la
  configurazione del client; `server/lib/ai-usage.ts` gestisce prenotazione e
  finalizzazione quota; `server/lib/meal-plan-latency-monitor.ts` è la
  telemetria operativa delle chiamate Piano Pasti.
- Sono inclusi retry di formato, vincoli e varietà nel codice originale,
  insieme ai test corrispondenti.

## Configurazione OpenAI inclusa

I riferimenti di configurazione sono nel codice, senza alcun valore:

- `OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`

Versione SDK: `openai` `^6.18.0`, documentata in `package.json` e bloccata in
`package-lock.json`.

## Database e migrazioni incluse

- Definizioni correnti: `shared/schema.ts` (`mealPlans`, `mealPlanItems`,
  consensi e telemetria Piano Pasti).
- Configurazione Drizzle: `drizzle.config.ts`.
- Migrazioni disponibili e pertinenti: `0014_privacy_consent.sql`,
  `0015_ai_optin_default.sql`, `0030_meal_plan_latency_alert_state.sql`,
  `0031_meal_plan_latency_alert_delivery_claim.sql`.
- Non esiste nel progetto una migrazione SQL storica dedicata alla creazione
  iniziale di `meal_plans` e `meal_plan_items`; la loro definizione completa
  disponibile è in `shared/schema.ts`.

## Test inclusi

L'archivio contiene i test esistenti del generatore, parser, vincoli,
sostituzione/persistenza, policy/quota/errori AI e monitor Piano Pasti,
oltre a `e2e/meal-plan-replace.test.ts`. Non sono stati creati test nuovi per
questa raccolta.

## Inventario e assenze note

L'archivio include un file `INCLUDED_FILES.md` con il manifest esatto.

File richiesti che non esistono come entità distinte nel progetto:

1. un campo/type/schema separato `intolerances`;
2. una migrazione storica SQL dedicata alla creazione iniziale di
   `meal_plans` e `meal_plan_items`.