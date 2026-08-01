---
name: Upload storage persistente (Replit Object Storage)
description: Regole per gli upload utente /uploads (chat, allegati bollette, avatar) tra disco locale e bucket Replit
---

- Gli upload utente passano da un'astrazione unica (multer scrive un temp locale, poi il persist decide in base a `STORAGE_MODE`): `local` default in dev, `object-storage` SOLO in produzione. Valore sconosciuto = crash all'avvio (fail-closed).
- **Why:** su deployment autoscale il disco locale non è persistente: gli allegati sparivano tra riavvii.
- **How to apply:** ogni nuovo tipo di upload utente deve usare l'astrazione (persist/delete/serve), mai unlink o static diretti; le delete devono coprire disco E bucket; il serving dal bucket va confinato al prefisso del mount (un mount pubblico come /uploads/avatars non deve mai raggiungere chiavi private) con fallback static per file legacy.
- In questo repl il sidecar default-bucket ritorna vuoto: passare SEMPRE il bucketId esplicito (secret `DEFAULT_OBJECT_STORAGE_BUCKET_ID`) al Client di `@replit/object-storage`.
- Provisioning bucket dall'ambiente agent: callback sandbox `setupObjectStorage({})` (crea bucket + secrets); NON compare nella ricerca integrazioni.
- Le foto ricette AI restano su disco locale: cache rigenerabile, fuori da questa astrazione (c'è un task dedicato).
