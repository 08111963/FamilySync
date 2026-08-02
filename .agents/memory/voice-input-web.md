---
name: Mic hold-to-talk su web
description: Comportamento del pulsante microfono su web (hold-to-talk stile WhatsApp) e perché il toggle è stato abbandonato
---

Regola (2 ago 2026, scelta ESPLICITA dell'utente che ha rifiutato il toggle): il microfono è **hold-to-talk stile WhatsApp su tutte le piattaforme** — tieni premuto, parli, al rilascio trascrive nel campo. Non reintrodurre la modalità "tap = avvia / secondo tap = ferma" su web.

Differenze web vs nativo:
- web: tocco troppo breve (o rilascio durante un avvio lento) annulla MA mostra un suggerimento inline non bloccante ("tieni premuto mentre parli") — mai annullare in silenzio e mai window.alert per questo caso;
- nativo: tocco breve annulla in silenzio, come WhatsApp.

**Why:** la modalità toggle (introdotta il 29 lug per un bug reale su Android Chrome) confondeva l'utente: rilasciava il dito e la registrazione continuava. Il bug originale (browser che "rilascia" da solo il tocco) è coperto in altro modo: `touchAction:"none"`+`userSelect:"none"`, listener globali `pointerup`/`blur`, recovery "nuova pressione mentre registra = ferma e trascrivi" (pointerup perso), timeout di sicurezza 60s che ferma e trascrive da solo.

Su web i tocchi del microfono NON passano dal Pressable (che confonde pointercancel con un rilascio): listener DOM diretti `pointerdown` (con setPointerCapture) / `pointerup` / `pointercancel` sul nodo. `pointercancel` = browser ha perso il dito (Android lo fa durante l'avvio del mic): NON è un rilascio → la registrazione continua con hint "tocca per fermare"; il vero rilascio è solo `pointerup`.

**How to apply:** logica pura in components/voice-input-press-logic.ts (testata in server/__tests__/voice-input-web-tap.test.ts); il componente esegue le azioni. Qualsiasi nuovo controllo press-and-hold su web deve seguire lo stesso schema (stesse guardie + feedback visivo, mai annullamento muto su web).

- Alert.alert di react-native-web è un NO-OP: su web ogni errore mostrato via Alert è invisibile. Usare un helper (window.alert o toast) per i messaggi d'errore utente su web (fatto in VoiceInput con showAlert).
- Le PWA installate da familysync.eu conservano a lungo il bundle vecchio: dopo un Republish serve chiudere l'app e riaprirla (o reinstallarla) per vedere la versione nuova.
