---
name: Alert.alert è un no-op sul web
description: react-native-web non implementa Alert.alert — errori/dialoghi invisibili nel browser
---

Regola: sul web (familysync.eu nel browser) `Alert.alert` di react-native non mostra nulla (no-op in react-native-web). Ogni messaggio d'errore o suggerimento passato ad Alert.alert è invisibile all'utente web.

**Why:** l'utente segnalava "il microfono non funziona e non riceve nessun messaggio": la trascrizione falliva o veniva annullata, ma tutti gli alert (quota, tocco troppo breve, errori) erano silenziosi sul web.

**How to apply:** usare l'helper cross-platform `lib/alert.ts` (`showAlert`) al posto di `Alert.alert` per qualsiasi messaggio che deve essere visibile anche sul web. Molti file usano ancora Alert.alert direttamente: se un utente web dice "non succede niente / nessun messaggio", sospettare prima di tutto un alert invisibile.
