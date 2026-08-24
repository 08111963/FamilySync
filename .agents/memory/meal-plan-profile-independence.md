---
name: Indipendenza dei profili Piano Pasti
description: Regole di prodotto che mantengono separati i sette profili chiusi del Piano Pasti AI.
---

I sette profili del Piano Pasti sono scelte indipendenti. Solo Mediterranea può
ricevere la rotazione locale pasta/legumi/patate, le quote mediterranee e
l'eventuale carne rossa. Senza glutine e Senza lattosio sono profili autonomi
con le rispettive esclusioni, non varianti mediterranee.

**Why:** far ereditare regole mediterranee ai profili “senza” introduce prompt
contraddittori, riduce inutilmente gli ingredienti consentiti e aumenta i
fallimenti del solo repair disponibile.

**How to apply:** aggiungendo regole, blueprint o validazioni, applicarli
soltanto al profilo che li dichiara. Per Sportiva, pranzo e cena devono avere
proteine e carboidrati complessi nominati con ingredienti concreti; non usare
placeholder nutrizionali.