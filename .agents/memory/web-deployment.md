---
name: Web deployment
description: How familysync.eu production is published (Expo web export + Express), deployment target, and port-mapping pitfalls.
---

# Web deployment (familysync.eu)

- familysync.eu serves the REAL Expo web app: deploy build = `expo export --platform web` in `web-build`, patched da `scripts/patch-web-build.sh`; Express la serve come SPA.
- Target di produzione: **Reserved VM** (sempre acceso) per far girare i promemoria orari senza dipendere dal traffico. Autoscale li faceva partire in ritardo.
- **Cambiare tipo di deployment richiede unpublish + publish**: il pulsante Republish riusa il tipo esistente e ignora `deploymentTarget` in `.replit`. Percorso UI: Publishing → Manage → "Change deployment type".
- **Port mapping critico**: la porta con `externalPort = 80` in `.replit` è quella che il deployment VM espone e su cui fa il probe `GET /`. Deve puntare al backend (localPort 5000), NON alla porta Metro/Expo 8081 (che in prod non esiste). Con 8081→80 il promote falliva in timeout senza alcun log runtime.
  - **Why:** primo publish VM (ago 2026) fallito così; su autoscale la mappatura sbagliata era passata inosservata.
  - **How to apply:** prima di ogni publish verificare che 5000→80 in `[[ports]]`.
- Nel publish dopo un unpublish: NON spuntare "Create production database" né "Copy development database" — il DB prod esistente viene ritrovato e riagganciato; il dominio custom resta configurato in Domains.
