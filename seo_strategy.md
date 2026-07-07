# SEO Strategy

## In scope
- Landing pubblica e route web pre-login (`/`, `/welcome`, `/login`, `/forgot-password`, `/reset-password/:token`)
- Pagine legali pubbliche (`/legal/privacy`, `/legal/terms`, `/legal/delete-account`)
- Guida utente pubblica (`/help/user-guide`)

## Out of scope
- Dashboard autenticata e route sotto `/(tabs)`
- Modali e schermate disponibili solo dopo login
- Route tokenizzate o personali non pensate per l'indicizzazione (`/join/:token`, `/calendar-feed/:token`)
- API REST sotto `/api/**`

## Target audience
- Famiglie italiane che cercano un'app per coordinare calendario, spesa, faccende, bollette e chat familiare.

## Primary keywords
- app coordinamento familiare
- calendario famiglia condiviso
- lista spesa condivisa famiglia
- gestione faccende famiglia
- app famiglia organizzazione

## Dismissed categories
- (None yet)

## Notes
- Stack ibrido: export Expo web servito come SPA da `web-build/`, più alcune pagine HTML pubbliche servite da Express.
- Le pagine pubbliche SSR attualmente sono le route `server/routes/legal.ts` e `server/routes/help.ts`.
- Le route pubbliche Expo (`/welcome`, `/login`, `/forgot-password`, `/reset-password/:token`) condividono la stessa shell HTML del build web.
