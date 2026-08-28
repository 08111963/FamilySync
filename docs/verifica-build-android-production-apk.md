# Verifica versioni build Android `production-apk`

## Esito

Il 28 agosto 2026 sono state completate due build EAS Android reali. La prima
ha verificato i valori correnti di `app.json`; la seconda ha verificato che EAS
leggesse anche i valori incrementati localmente. Dopo l'upload della seconda
build, `app.json` è stato ripristinato a `1.0.3` / `8`.

| Voce | Valore |
| --- | --- |
| Configurazione EAS | `cli.appVersionSource: "local"` |
| Build corrente | `dad980fa-bf7f-441b-9439-f4f5d876f6b5` |
| Stato / versione | `FINISHED` — `1.0.3` / `8` |
| Manifest APK | `versionName=1.0.3`, `versionCode=8` |
| Dimensione / SHA-256 | 106.087.986 byte / `f3e0b7400aca7848ea1bbb49effa31e7bac3cc9c3b1017f7ab06b5deec7f9786` |
| Build incrementata | `51e961fa-940f-41a9-b720-caa2b5bc90da` |
| Stato / versione | `FINISHED` — `1.0.4` / `9` |
| Manifest APK | `versionName=1.0.4`, `versionCode=9` |
| Dimensione / SHA-256 | 106.087.990 byte / `406de1d9e1a56cf3dfd5a7819b138455c6ed1ff96fe64ea0cd64675cd130c801` |

Entrambi i record EAS riportano `error: null`. Nei log, l'unica occorrenza di
`appVersionSource` è la lettura della configurazione con valore `local`: il
precedente avviso sulla fonte della versione non compare.

## Artefatti

- [APK `1.0.3` / `8`](https://expo.dev/artifacts/eas/w_DZCUIzXPputoxVuKxdZEQnIOgM8CocLDjEYBMJY_k.apk)
- [APK di prova `1.0.4` / `9`](https://expo.dev/artifacts/eas/iAyAvnl1JeO97GrC-eD8_FcwX2BOpruoJxVEf9A5F_c.apk)

## Procedura ripetibile

1. Impostare `expo.version` e `expo.android.versionCode` in `app.json`.
2. Avviare la build senza attesa integrata:

   ```sh
   npx eas-cli build --platform android --profile production-apk \
     --non-interactive --no-wait --json
   ```

3. Attendere `FINISHED` interrogando l'ID restituito:

   ```sh
   npx eas-cli build:view <build-id> --json
   ```

4. Scaricare l'APK e verificare direttamente il manifest binario:

   ```sh
   node scripts/verify-android-apk-version.mjs app.apk 1.0.3 8
   ```

Il comando termina con codice diverso da zero se `versionName` o `versionCode`
non coincidono con i valori attesi. Ripetere questa verifica a ogni incremento
in `app.json`.