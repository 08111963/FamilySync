# FamilySync — pacchetto immagini store

Campagna fotografica coordinata per Google Play e Apple App Store. Le immagini
uniscono fotografie editoriali generate per il progetto e **catture reali
dell'app** popolate esclusivamente con dati dimostrativi della Famiglia Bianchi.

Il set si rigenera in modo deterministico con:

```bash
node assets/store/generate-store-assets.mjs
```

## Ordine consigliato

1. **Home** — Non tenere tutto in testa.
2. **Calendario** — Chi porta chi, e quando?
3. **Lista spesa** — La lista non resta sul frigo.
4. **Faccende e premi** — Meno solleciti. Più collaborazione.
5. **Piano pasti AI** — La domanda “cosa mangiamo?” finisce qui.
6. **Dispensa e ricette** — Apri il frigo. Trova un'idea.
7. **Budget e bollette** — I conti di casa, senza caccia al foglio.
8. **Chat e famiglia** — La chat che sa di casa.

## Testi alternativi

- Home: "Schermata Home di FamilySync con eventi, faccende e membri della Famiglia Bianchi."
- Calendario: "Calendario FamilySync con impegni della Famiglia Bianchi e colloquio di Emma."
- Spesa: "Lista della spesa condivisa FamilySync con prodotti assegnati e avanzamento."
- Faccende: "Schermate reali Faccende e Premi FamilySync con compiti, punti e ricompense."
- Piano pasti AI: "Piano pasti settimanale FamilySync con pasti organizzati per la famiglia."
- Dispensa: "Schermate reali Ricette e Dispensa FamilySync con prodotti, scadenze e idee per i pasti."
- Budget: "Schermate reali Budget e Bollette FamilySync con spese mensili e scadenze."
- Chat: "Due schermate FamilySync distinte per la chat privata e la gestione dei profili bambini."

## Dati fittizi

Famiglia Bianchi; membri Luca Bianchi, Sara Bianchi, Emma Bianchi e Tommaso
Bianchi. Eventi, prodotti, ricette, messaggi e importi sono inventati
esclusivamente per la presentazione. Non sono presenti dati di utenti reali né
contenuti delle vecchie schermate.

## File e controlli

- `png/google-01-home.png` … `google-08-chat-famiglia.png`: PNG 1080×1920.
- `png/apple-01-home.png` … `apple-08-chat-famiglia.png`: PNG 1290×2796.
- `png/google-feature-graphic.png`: PNG 1024×500.
- `captures/google/*.png` e `captures/apple/*.png`: catture grezze reali
  dell'app usate dal generatore.
- `photo-family-*.jpg`: fotografie editoriali fittizie usate nella campagna.

Tutti i PNG sono esportati con `sharp`, appiattiti su crema (nessun canale
alpha), in formato RGB 24-bit.