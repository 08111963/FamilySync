---
name: Premi riscattabili
description: Convenzioni del catalogo premi famiglia riscattabili con i punti faccende
---

# Premi riscattabili

- Il riscatto scala `familyMembers.points` con UPDATE atomico (`WHERE points >= cost`) dentro una transazione insieme all'insert della redemption: mai leggere-poi-scrivere i punti.
- **Why:** due riscatti concorrenti non devono mandare i punti in negativo; la guardia nella WHERE è l'unico lock necessario.
- DELETE premio = soft (`isActive=false`), mai hard delete: la cronologia (`reward_redemptions`, con `rewardTitle` snapshot) deve restare leggibile.
- Gestione catalogo riservata ai ruoli `admin` e `adult`; riscatto aperto a tutti i membri.
- **How to apply:** qualsiasi futura modifica a premi/punti (bonus, storni) deve passare dallo stesso pattern atomico e preservare lo storico.
