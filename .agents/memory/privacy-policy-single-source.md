---
name: Privacy policy fonte unica
description: Regola su dove vive il testo della Privacy Policy e come si rigenera DOCX/web/mobile.
---
Il testo legale della Privacy Policy vive SOLO in `shared/privacy-policy-content.ts` (sezioni con blocchi p/li, grassetto con `**`). Consumatori: pagina web `/legal/privacy` (server/routes/legal.ts), schermata mobile `app/legal/privacy.tsx`, DOCX `scripts/generate-privacy-docx.ts` (OOXML costruito a mano + zip CLI, nessuna dipendenza npm).
**Why:** in passato web e mobile divergevano; la fonte unica è requisito del mandato di revisione GDPR v2.1. Un test (`server/__tests__/policy-source.test.ts`) fallisce se i renderer non importano la fonte o se ricompaiono testi vietati (retention 12 mesi, "OpenAI, L.L.C.", meccanismi di trasferimento inventati).
**How to apply:** per modifiche alla policy toccare solo il file shared, poi rigenerare DOCX (`npx tsx scripts/generate-privacy-docx.ts`), riesportare la build web e aggiornare la versione in `shared/policy-version.ts`.
Nota ZIP consegna: `scripts/export-consegna.sh` scandisce il contenuto dello ZIP (niente `head` nelle condizioni con pipefail; test inclusi con allowlist di password fittizie).

**Attenzione — informativa minori duplicata:** la versione semplificata per ragazzi esiste in DUE copie da tenere allineate a mano: `server/routes/legal.ts` (rotta /legal/minori web) e `app/legal/minors.tsx` (schermata mobile). Ogni modifica ai contenuti minori va replicata in entrambe (il code review l'ha già beccata una volta, agosto 2026).
