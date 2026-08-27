---
name: Determinismo test di concorrenza
description: Come verificare in modo stabile conflitti optimistic-lock senza dipendere dal timing di rete o database.
---

Le richieste HTTP lanciate insieme non dimostrano necessariamente un conflitto: il server può completarne una prima che l'altra legga lo stato. Nei test di un compare-and-swap, sincronizzare le richieste immediatamente dopo la lettura dello stato precedente e prima dell'update condizionale.

**Why:** una gara non coordinata può linearizzarsi correttamente con due successi, rendendo il test intermittente e lasciando scoperto il ramo che comunica il conflitto e pulisce la risorsa perdente.

**How to apply:** esporre un hook no-op riservato ai test nel punto tra read e CAS; il test lo usa come barriera per le due mutazioni, lo azzera in `finally`, quindi verifica stato finale, errore esplicito e assenza di file orfani.