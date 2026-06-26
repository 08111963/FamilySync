---
name: Express 5 + TypeScript params typing
description: Why req.params/req.query are string|string[] under @types/express 5 and how this repo handles it
---

# Express 5 typed params

`@types/express` v5 types `ParamsDictionary` as `{ [key: string]: string | string[] }`,
so every `req.params.x` and `req.query.x` is `string | string[]` (not `string`).
This caused ~130 of 146 TS errors during a strict cleanup.

**Decision:** use the helpers in `server/lib/http-params.ts` — `getParam(req, name): string`
and `getQuery(req, name): string | undefined` — instead of touching `req.params`/`req.query`
directly in route handlers. Applied across all route files.

**Why:** keeps strict mode + no `as any`/`@ts-ignore`; centralizes the array-vs-string handling.
**How to apply:** any new route handler reading a path/query param should call these helpers.
Note: `getParam` returns `''` for the anomalous empty-array/no-match case (not an explicit error).

# Drizzle column-type gotchas (this schema)
- `numeric(...)` columns map to `string | null` on insert/select — stringify numbers before insert
  (e.g. recipeIngredients.quantity, shoppingItems.quantity).
- pgEnum columns need values constrained to the enum: validate with `z.enum(enum.enumValues)` or a
  type guard `(u): u is T => set.has(u)` derived from `enumEnum.enumValues` — avoid casting.
- NOT NULL columns with a default still reject `null` on insert — use a fallback (`?? 'food'`).

# stripe-replit-sync runMigrations
`MigrationConfig` accepts ONLY `{ databaseUrl, ssl?, logger? }` — no `schema` property.
