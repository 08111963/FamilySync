---
name: Trascrizione vocale con prompt di contesto
description: Prompt italiano per gpt-4o-mini-transcribe + filtro anti-eco del prompt
---

La trascrizione vocale passa un prompt di contesto italiano (baseHint + campo multipart `context` opzionale, max 300 char) a gpt-4o-mini-transcribe per migliorare l'accuratezza.

**Rischio scoperto:** con audio vuoto/rumore il modello "allucina" restituendo il prompt stesso come trascrizione (verificato con audio sine: la risposta era l'eco letterale del prompt).

**Regola:** ogni prompt passato a un modello di trascrizione richiede un filtro anti-eco lato server (`isPromptEcho`): scarta solo trascrizioni lunghe (>=30 char contigui nel prompt, o >=8 parole con >=90% dal prompt e >=60% di copertura del prompt). MAI scartare frasi brevi ("venerdì alle 20") e MAI mettere frasi d'esempio complete nel `context` dei client, altrimenti dettature legittime identiche all'esempio verrebbero scartate.

**How to apply:** test regressivi in server/__tests__/prompt-echo.test.ts; il client passa `context` come prop di VoiceInput.

- Clip vocali molto brevi: qualsiasi prompt di contesto fa allucinare parole del dominio al modello di trascrizione. Regola: sotto una soglia di durata/dimensione trascrivere SENZA prompt.
