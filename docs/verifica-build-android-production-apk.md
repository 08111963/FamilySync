# Verifica build Android `production-apk`

## Esito

La build EAS Android avviata dopo la riduzione dell'archivio è terminata con
successo e ha prodotto l'APK.

| Voce | Valore |
| --- | --- |
| Stato EAS | `FINISHED` |
| Build ID | `99667843-2113-4361-9587-495bc02c43d4` |
| Profilo | `production-apk` |
| Piattaforma | Android |
| Commit sorgente | `b7e2cada10deb8456283173bd43d2c543bff2b05` |
| Versione / versionCode | `1.0.3` / `8` |
| Completata il | 2026-08-27T16:55:54.772Z |
| Errore EAS | nessuno (`null`) |
| Dimensione APK | 106.087.986 byte |

## Artefatto

[Scarica l'APK prodotto da EAS](https://expo.dev/artifacts/eas/cvwrVACyMVc4bOaBgeZKIlG87CZd4cNkMuOwC27QjAA.apk)

Il controllo HTTP dell'artefatto ha restituito `200` con allegato
`application-99667843-2113-4361-9587-495bc02c43d4.apk`.

## Verifiche effettuate

- Il profilo `production-apk` ha usato `android.buildType: "apk"`.
- Il file `.easignore` usato dalla build coincide con quello verificato dopo il
  rebase: gli output generati e gli archivi locali sono esclusi, non gli input
  nativi dell'app.
- EAS non ha riportato errori di compilazione, dipendenze o asset mancanti e ha
  pubblicato l'artefatto APK indicato sopra.

## Nota su `expo doctor`

`expo doctor` segnala 12 versioni di pacchetti non perfettamente allineate al
patch level di Expo SDK 54, inclusa una discrepanza maggiore per
`expo-apple-authentication`. È un controllo di allineamento delle versioni,
non un errore di dipendenza o asset mancante: la build EAS ha installato il
lockfile corrente e ha concluso con successo. L'aggiornamento coordinato dei
pacchetti richiede una modifica separata, perché cambierebbe le dipendenze al
di fuori della verifica dell'archivio EAS.