---
name: Copertura regressioni SEO
description: Decisione di test per i metadati delle pagine pubbliche SSR.
---

I controlli dei metadati SEO devono esercitare via HTTP sia le route documentali SSR sia l'iniezione dei metadati nell'HTML statico dell'app.

**Why:** le guide e i documenti legali producono HTML dai loro router, mentre le pagine pubbliche dell'app ricevono tag dinamici dal wrapper del server. Un test su un solo percorso non intercetta regressioni nell'altro.

**How to apply:** quando si modificano wrapper HTML, route pubbliche o build Expo web, eseguire il comando di test SEO registrato e mantenere verificati title, description, canonical, Open Graph e Twitter Card per entrambi i percorsi.