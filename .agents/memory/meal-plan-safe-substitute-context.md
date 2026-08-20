---
name: Ricette con sostituti sicuri
description: Come interpretare riferimenti abbreviati ai sostituti compatibili nelle istruzioni dei piani pasti.
---

Un riferimento abbreviato nei passaggi di una ricetta può essere accettato solo se l'ingrediente corrispondente è già dichiarato in modo esplicito e sicuro nella stessa ricetta. Per esempio una bevanda vegetale può essere chiamata "latte" nei passaggi; ciò non rende sicuri panna, burro, formaggi o allergeni diversi.

**Why:** le ricette dettagliate ripetono spesso gli ingredienti con un nome più breve. Validare ogni frase isolata causava falsi positivi e impediva la generazione di piani altrimenti compatibili.

**How to apply:** mantenere la validazione fail-closed per ogni ingrediente non dichiarato; usare il contesto soltanto per lo stesso sostituto esplicito e solo nei campi descrittivi o nei passaggi, mai per aggirare l'elenco degli ingredienti.