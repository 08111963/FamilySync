---
name: Family selection (currentFamily) state handling
description: How the active family is restored/validated and the stale-selection pitfall that makes screens silently dead
---

# Active family selection

- The active family id is persisted in AsyncStorage under key `@family_sync_active_family` (constant `ACTIVE_FAMILY_KEY` in `context/FamilyContext.tsx`).
- `currentFamily` is DERIVED: `families.find(f => f.id === currentFamilyId)`. If the stored id is not in the user's `/api/families` list, `currentFamily` is `null` even though `currentFamilyId` is set.

## Pitfall: stale selection = silently dead screens
- **Symptom:** user reports "clicking buttons does nothing" on family-dependent screens (e.g. AI insights). Many handlers start with `if (!currentFamily) return;` and `catch` blocks only `console.error`, so failures are invisible.
- **Root cause:** the logged-in account belonged to 0 families, but a stale `currentFamilyId` (from a *different* account that used the same device) was restored from AsyncStorage. The reset effect must clear it.
- **Why it happens across accounts:** the storage key is NOT user-scoped, so account B inherits account A's last-active family id on the same device. Recommended hardening: make the key `@family_sync_active_family:<userId>`.

## Rule for the reset effect
- Once `familiesQuery.data` is loaded: if empty → clear `currentFamilyId` (setState null + `AsyncStorage.removeItem`) so the app falls through to the existing "Crea la tua Famiglia" onboarding in `app/(tabs)/index.tsx` (`families.length === 0`). If non-empty and current id invalid → select first family and persist it. Do NOT early-return on `length === 0` without clearing.
- **Why:** leaving the stale id alive causes perpetual 403s on `/api/families/<id>`, `/api/calendar`, `/api/shopping`, `/api/chores` and a `WebSocket join_family denied: not a member`.
