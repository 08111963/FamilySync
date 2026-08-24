---
name: Contratto dei profili esclusivi
description: Regola per mantenere la composizione verificabile dei piani senza glutine e senza lattosio.
---

I profili senza glutine e senza lattosio usano sempre un piano di tre pasti al
giorno: sette colazioni deterministiche locali e sette pranzi più sette cene
generati dall'AI. Le preferenze legacy per due o quattro pasti non modificano
questa composizione.

**Why:** con due pasti le colazioni sicure verrebbero omesse; con quattro pasti
uno spuntino tornerebbe nel testo libero del modello. Entrambi i casi rompono il
contratto verificato di 7 + 14 e possono reintrodurre una via non coperta dalla
composizione locale.

**How to apply:** se si aggiungono categorie di pasto per questi profili, prima
definire una composizione locale e una validazione completa per ogni nuovo slot;
non farle entrare automaticamente nella richiesta AI esistente.