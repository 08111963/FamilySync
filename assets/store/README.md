# FamilySync — pacchetto immagini store

Set coordinato per Google Play e App Store, generato da SVG riproducibili con
`node assets/store/generate-store-assets.mjs`. La direzione visiva è **calda,
editoriale e quotidiana**: crema, corallo FamilySync, menta e giallo sole;
interfaccia reale in primo piano, decorazione ridotta al necessario.

## Ordine consigliato

1. **Home** — Tutto al posto giusto.
2. **Calendario** — Una settimana chiara.
3. **Lista spesa** — La spesa, già condivisa.
4. **Faccende e premi** — Ognuno fa la sua parte.
5. **Piano pasti AI** — A tavola, senza pensarci troppo.
6. **Dispensa e ricette** — Dal frigo alla tavola.
7. **Budget e bollette** — Il budget, con serenità.
8. **Chat e famiglia** — Sempre dalla stessa parte.

## Testi alternativi

- Home: "Schermata Home di FamilySync con eventi, faccende e membri della Famiglia Bianchi."
- Calendario: "Calendario FamilySync con impegni della Famiglia Bianchi e colloquio di Emma."
- Spesa: "Lista della spesa condivisa FamilySync con prodotti assegnati e avanzamento."
- Faccende: "Schermata Faccende FamilySync con compiti, punti e un premio familiare da riscattare."
- Piano pasti AI: "Piano pasti settimanale FamilySync generato con AI e tre cene della famiglia."
- Dispensa: "Dispensa FamilySync con prodotti disponibili, scadenze e ricetta suggerita."
- Budget: "Budget FamilySync con spese di settembre, progresso mensile e una bolletta luce in scadenza."
- Chat: "Due schermate FamilySync distinte per la chat privata e la gestione dei profili bambini."

## Dati fittizi

Famiglia Bianchi; membri Luca Bianchi, Sara Bianchi, Emma Bianchi e Tommaso
Bianchi. Eventi: colloquio di Emma, allenamento di Tommaso. Prodotti:
pane integrale, yogurt bianco, pomodori, latte, passata di pomodoro, uova e
riso basmati. Importi e messaggi sono inventati esclusivamente per la
presentazione. Non sono presenti dati delle vecchie schermate.

## File e controlli

- `png/google-01-home.png` … `google-08-chat-famiglia.png`: PNG 1080×1920.
- `png/apple-01-home.png` … `apple-08-chat-famiglia.png`: PNG 1290×2796.
- `png/google-feature-graphic.png`: PNG 1024×500.
- `source/*.svg`: sorgenti modificabili.

Tutti i PNG sono esportati con `sharp`, appiattiti su crema (nessun canale
alpha), in formato RGB 24-bit. Per ricreare il pacchetto:

```bash
node assets/store/generate-store-assets.mjs
```