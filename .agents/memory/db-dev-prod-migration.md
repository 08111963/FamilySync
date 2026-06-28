---
name: Dev->Prod data migration (separate databases)
description: How FamilySync's dev and production databases relate, and the one-time HTTP import path used to copy data into prod.
---

# Dev and production are SEPARATE databases
- Replit deployment (familysync.eu, autoscale) uses its OWN production database, distinct from the dev DATABASE_URL.
- Publishing migrates SCHEMA only, never DATA. So accounts/data created in dev do NOT appear on the live site.
- `executeSql({environment:"production"})` is READ-ONLY (replica). The production DATABASE_URL is runtime-managed and NOT exposed to the dev container, so there is no direct write path to prod.

**Why:** A user could not log in on familysync.eu because their account existed only in dev. Root cause was the separate prod DB, not a code bug.

# The only write path to prod is THROUGH the deployed app
- Pattern used: a temporary token-gated endpoint `POST /api/_migrate/import` (server/routes/migrate.ts) that wipes (TRUNCATE ... CASCADE) and bulk-inserts rows it receives as JSON.
- Gate: returns 404 unless `MIGRATE_TOKEN` env is set in production; requires header `x-migrate-token` to match. Disable by deleting the prod env var after use.
- All tables use UUID PKs (no sequences). Insert order must respect FKs (parents first); see INSERT_ORDER in migrate.ts. Only jsonb columns need re-stringify on insert (server stringifies any non-null object value).
- Flow: add endpoint -> set MIGRATE_TOKEN in prod env -> user Publishes once -> push dev rows via HTTPS -> verify -> delete MIGRATE_TOKEN (disables live endpoint) + remove code from repo.

**How to apply:** Use this whenever data must move dev->prod on Replit. Never promise a data copy without an app-side write path; my tools cannot write prod directly.
