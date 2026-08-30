---
name: Expo static auth hydration
description: Evitare React #418 nell'export statico Expo quando route private e stato browser non sono disponibili al server.
---

Nell'export statico Expo, una route protetta non deve renderizzare i propri figli mentre la sessione browser è ancora sconosciuta. Server e primo render client devono produrre lo stesso contenuto neutro; solo dopo il caricamento dell'autenticazione si monta la route privata o si esegue il redirect pubblico.

**Why:** Il server può prerenderizzare la Home privata nella radice senza conoscere la sessione salvata, la viewport, il tema o il fuso orario del browser. Il primo render client può quindi divergere e generare React #418 anche se, dopo il recupero, la pagina sembra visivamente corretta.

**How to apply:** Nei gate di autenticazione nascondere le route private durante lo stato iniziale incerto, senza togliere il prerender alle route pubbliche. Qualsiasi ramo basato su viewport/tema e qualsiasi testo temporale nelle route prerenderizzate deve usare un valore iniziale deterministico e aggiornarsi dopo il mount.