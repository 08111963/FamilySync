---
name: Limiti structured output Piano Pasti
description: Vincoli del gateway AI per il JSON strutturato della generazione settimanale.
---

Il gateway rispetta in modo affidabile le proprietà top-level obbligatorie, ma non ci si deve affidare a `minItems` per impedire un array vuoto. Ogni blocco deve usare una chiave obbligatoria per ciascuno dei suoi sette pasti e il piano completo va ricomposto solo lato server.

**Why:** il gateway ha lasciato passare un array vuoto per un contratto con `minItems: 21`. Duplicare invece la lista chiusa degli ingredienti in ogni slot supera il limite di 1.000 valori enum dello schema. Una sola risposta da 21 ricette complete ha chiuso con `finish_reason: length`: lo structured output non consegna contenuto parziale.

**How to apply:** generare una settimana in blocchi separati per tipo di pasto (sette colazioni, sette pranzi, sette cene; due blocchi per profili con colazioni locali sicure), con massimo 5.000 token per risposta. Ogni ricetta AI richiede 6–8 ingredienti e cinque passaggi concreti. Le liste alimentari chiuse vanno espresse nel prompt e validate fail-closed sull'intero piano prima della consegna o del salvataggio, non replicate come enum in ogni slot.