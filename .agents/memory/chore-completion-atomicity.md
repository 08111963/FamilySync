---
name: Chore completion must be atomic
description: Why the chore /complete endpoint guards isCompleted=false inside the UPDATE, not just a prior SELECT
---

# Chore completion atomicity

The chore `/complete` endpoint must perform the completion as a single atomic
UPDATE with `isCompleted = false` in the WHERE clause and use the RETURNING row
for all follow-up effects (points award, recurring-chore recreation, calendar
event deletion). If the UPDATE returns 0 rows, respond `ALREADY_COMPLETED`.

**Why:** a plain `SELECT`-then-`UPDATE` (checking `isCompleted` only on the
SELECT) lets two concurrent complete requests both pass the check, so points get
awarded twice AND a recurring chore gets recreated twice (duplicate next
occurrence). This was a real bug flagged in review.

**How to apply:** any "mark X done once" side-effecting endpoint (chores, and by
analogy bills or similar one-shot state transitions) must gate the state flip in
the UPDATE WHERE and branch on whether a row was actually updated — never trust a
prior read. Recurring-chore recreation runs only after the atomic UPDATE succeeds.
