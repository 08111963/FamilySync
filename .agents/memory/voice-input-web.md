---
name: Mic hold-to-talk su web
description: Perché il pulsante "tieni premuto per parlare" falliva su web/canvas iframe e come è stato reso robusto
---

Regola: un controllo "tieni premuto per parlare" su web deve avere `touchAction: "none"` + `userSelect: "none"` (con prefissi WebKit). Comportamento aggiornato (29 lug 2026, dopo bug reale su Android Chrome): su **web** un tap breve NON deve annullare in silenzio — l'utente medio tocca, non tiene premuto, e otteneva zero feedback e zero richieste al server. Su web: tap = avvia, secondo tap = ferma e trascrive; hold >250ms con rilascio = trascrive; solo il blur finestra durante l'avvio annulla. Su nativo resta lo stile WhatsApp puro (rilascio ferma sempre, tocco <250ms annulla in silenzio). Mai annullare con un alert "tieni premuto".

**Why:** il browser annullava la pressione prolungata (scroll/selezione testo, o rilascio per rispondere al prompt permesso microfono), quindi l'app vedeva sempre un "tocco troppo breve" e mostrava in loop l'avviso, anche con il dito fermo sul pulsante.

**How to apply:** VoiceInput gestisce hold e toggle insieme (justStoppedRef evita che il pressOut del tap di stop rifermi; il listener globale pointerup agisce solo se la pressione è partita dal pulsante). Qualsiasi nuovo controllo press-and-hold su web deve seguire lo stesso schema.

- Alert.alert di react-native-web è un NO-OP: su web ogni errore mostrato via Alert è invisibile. Usare un helper (window.alert o toast) per i messaggi d'errore utente su web (fatto in VoiceInput con showAlert).
- Le PWA installate da familysync.eu conservano a lungo il bundle vecchio: dopo un Republish serve chiudere l'app e riaprirla (o reinstallarla) per vedere la versione nuova.
