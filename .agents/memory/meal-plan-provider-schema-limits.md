---
name: Limiti structured output Piano Pasti
description: Vincoli del gateway AI per il JSON strutturato della generazione settimanale.
---

Per una settimana completa, il gateway rispetta in modo affidabile le proprietà top-level obbligatorie, ma non si deve affidare a `minItems` per impedire un array vuoto. Usare una chiave obbligatoria per ciascuno dei 21 pasti e ricomporre l'array solo lato server.

**Why:** il gateway ha lasciato passare un array vuoto per un contratto con `minItems: 21`. Duplicare invece la lista chiusa degli ingredienti in ogni slot supera il limite di 1.000 valori enum dello schema. Con output troppo prolisso, il modello chiude con `finish_reason: length` e lo structured output può non consegnare contenuto parziale.

**How to apply:** mantenere il tetto di 4.800 token con descrizioni e passaggi compatti, tre o quattro ingredienti essenziali e tre passaggi brevi. Le liste alimentari chiuse vanno espresse nel prompt e validate fail-closed dal server prima della consegna o del salvataggio, non replicate come enum in tutti i 21 slot.