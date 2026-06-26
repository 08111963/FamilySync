---
name: Backend testing approach
description: How to write/run backend tests in this repo without adding deps
---

This project has **no test runner configured** (no vitest/jest, no `test` script in package.json) and package.json must not be edited directly.

Run backend tests with Node's built-in runner via tsx (no new dependency):
`npx tsx server/__tests__/<file>.test.ts` — tests written with `node:test` + `node:assert/strict` execute on import.

**Why:** the expo skill forbids editing package.json; `node:test` + `tsx` gives a durable regression suite with zero deps.

**How to apply:** for security-critical logic (upload MIME/extension handling, path-traversal guards, block/typing predicates) extract small *pure exported* helpers and add test hooks (injectable fetcher/clock) so cache/TTL behavior is testable without a DB or real timers. See `server/__tests__/`.
