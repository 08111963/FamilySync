---
name: Bills custom-split validation parity
description: Frontend numeric validation must mirror the backend formula exactly to avoid enabling saves the server rejects.
---

# Ripartizione bollette: parità validazione FE/BE

Quando il frontend pre-valida un confronto numerico che il backend ri-valida (es. somma quote == importo bolletta, tolleranza 0.01), il frontend DEVE usare la stessa identica formula del backend, senza arrotondamenti anticipati sul valore confrontato.

**Why:** in review è emerso un FAIL: il FE arrotondava la differenza a 2 decimali PRIMA del confronto (`Math.abs(round(diff)) <= 0.01`), così abilitava "Salva" su differenze ~0.014 che il BE (che confronta il valore grezzo) poi rifiutava. Risultato: salvataggio bloccato lato server con errore generico.

**How to apply:** confrontare il valore grezzo (`Math.abs(billTotal - enteredTotal) <= 0.01`); tenere l'arrotondamento SOLO per la visualizzazione. Inoltre l'error handling del FE deve intercettare i codici reali del BE (qui `VALIDATION_ERROR`, `INVALID_MEMBER`, `PREMIUM_REQUIRED`), non codici inventati.
