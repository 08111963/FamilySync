---
name: Shopping items quantity numerica
description: shopping_items.quantity è NUMERIC con unit VARCHAR(10) separata — mai concatenare "200 g" nella quantity
---
La tabella `shopping_items` ha `quantity NUMERIC` e `unit VARCHAR(10)` separate.
**Why:** la conversione piano pasti→spesa concatenava "quantità unità" in un'unica stringa e causava 500 (invalid input syntax for type numeric); stesso rischio per ogni nuovo inserimento di item spesa.
**How to apply:** usare `toShoppingQuantity()` in `server/lib/shopping-quantity.ts` per convertire quantità/unità libere; per il dedup contro liste esistenti usare SEMPRE `normalizeItemName()` sui nomi correnti (il `normalizedName` salvato in recipe_ingredients può derivare da versioni precedenti del normalizzatore e non combacia).
