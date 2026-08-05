---
name: Google Calendar direct sync
description: Per-user OAuth (calendar.events) writes FamilySync events straight into the user's Google Calendar; conventions and gotchas.
---

- Flusso separato dal login social: stesso client GOOGLE_OAUTH_*, ma redirect dedicato `/api/calendar-sync/google/callback` e state firmato (derivato da SESSION_SECRET) che contiene lo userId autenticato — il callback è pubblico ma il collegamento resta legato all'utente giusto.
- **Refresh token cifrato** (AES-256-GCM, chiave derivata da SESSION_SECRET, fail-closed in prod) in `google_calendar_connections`; access token solo in cache in-memory per istanza (ok su autoscale: Google supporta access token concorrenti dallo stesso refresh token).
- **Fail-visibile**: `invalid_grant`/401 persistente/scope insufficiente → `status='expired'` + lastError; la UI mostra "collegamento scaduto, ricollega". Mai fallback silenziosi.
- Mapping in `google_calendar_event_links` (unique user+event, cascade su delete evento). **Why:** la cascade cancella i link — nelle DELETE degli eventi i googleEventId vanno letti PRIMA di cancellare (il route delete ora seleziona gli id della serie e i link prima della delete).
- Eventi ricorrenti: una riga per occorrenza → un evento Google per occorrenza (niente RRULE lato Google), coerente con il feed ICS.
- Sync in background (`void ...`) dopo create/update/delete; su create esclusi gli utenti block-related al creatore (come per le push). PATCH 404/410 → link rimosso e evento ricreato.
- `prompt=consent` + `access_type=offline` obbligatori per avere sempre il refresh_token; scope verificato nella risposta token (MISSING_CALENDAR_SCOPE se l'utente non spunta la casella).
- **Owner action**: lo scope calendar.events richiede verifica su Google Cloud Console (consent screen) prima della produzione.
- Il feed ICS resta l'alternativa per Apple/Outlook.
