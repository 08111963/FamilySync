---
name: Mic hold-to-talk su web
description: Perché il pulsante "tieni premuto per parlare" falliva su web/canvas iframe e come è stato reso robusto
---

Regola: un controllo "tieni premuto per parlare" su web deve avere `touchAction: "none"` + `userSelect: "none"` (con prefissi WebKit) e un fallback toggle: tocco breve avvia la registrazione, il tocco successivo ferma e trascrive. Mai annullare con un alert "tieni premuto" — su web il pressOut prematuro non è colpa dell'utente.

**Why:** il browser annullava la pressione prolungata (scroll/selezione testo, o rilascio per rispondere al prompt permesso microfono), quindi l'app vedeva sempre un "tocco troppo breve" e mostrava in loop l'avviso, anche con il dito fermo sul pulsante.

**How to apply:** VoiceInput gestisce hold e toggle insieme (justStoppedRef evita che il pressOut del tap di stop rifermi; il listener globale pointerup agisce solo se la pressione è partita dal pulsante). Qualsiasi nuovo controllo press-and-hold su web deve seguire lo stesso schema.
