---
name: AI gateway latency is throughput-bound
description: Why AI generation felt slow / "generated nothing", the parallelization fix, and progressive NDJSON streaming
---

# Replit AI gateway latency is dominated by output size

The Replit AI integration gateway (`AI_INTEGRATIONS_OPENAI_*`, model gpt-4o-mini) has
very low base latency (~500ms for tiny outputs) but generates at only ~47 tokens/sec.
So wall-clock time scales with the number of output tokens, NOT with prompt size or
rate limits. Measured: a single large JSON generation of a 21-meal weekly plan
(~2500-6000 tokens) took ~35-53s; 8 full recipes ~42s; a recipe search ~30s.

**Symptom:** users report AI features "generate nothing" or "with big delay". The
"nothing" is the mobile client / proxy giving up on a 30-50s request; the "delay" is
the raw generation time.

**Fix that worked:** split one big generation into several SMALL generations and run
them concurrently with `Promise.allSettled` (per-call overhead is tiny and the gateway
genuinely serves concurrent calls in parallel — it does NOT serialize same-key
requests). Merge + dedup results, tolerate partial failures (skip failed chunks rather
than failing the whole request). Example outcomes: weekly meal plan split per-day
(7 parallel calls) dropped from ~53s to ~12s; recipes split into batches of 3 dropped
to ~23s.

**Why:** latency is throughput-bound, so N parallel calls of size S/N finish in ~(S/N)
time instead of ~S. Smaller chunks = more parallelism = lower wall-clock.

**Also:** set the OpenAI client `timeout` and a low `maxRetries` (e.g. 1) — the default
high retry count amplifies delay on transient errors, and no timeout lets a call hang.

**How to apply:** any time an AI JSON generation here produces a large list (meal plans,
recipe lists, batched suggestions), prefer chunked parallel calls over one big call.
Keep per-chunk `max_tokens` generous enough to avoid truncation (truncation → invalid
JSON → lost chunk).

## Progressive streaming on top of parallel chunks

Parallelizing helps the average case but the SLOWEST chunk still dominates total time,
and gateway latency varies run-to-run (measured the same 7-day plan at both ~12s and
~22s). So show results progressively: stream each chunk to the client the moment it
resolves instead of awaiting the whole batch. With per-day chunks the user sees most
days within ~6-7s even when one straggler day takes 20s+.

**Pattern that works here:** the chunk generator (e.g. `generateWeeklyMealPlan`) takes an
optional `onProgress(items)` callback fired inside the `Promise.allSettled` map as each
chunk resolves (filter/sort that chunk before emitting). A separate additive streaming
route writes NDJSON (one JSON object per line: `{type:'items'}` per chunk, then
`{type:'done'}`, `{type:'error'}` on failure) with `res.flushHeaders()` +
`X-Accel-Buffering: no` + `Cache-Control: no-transform`. The non-streaming route stays
untouched. On the RN/Expo client, stream with `expo/fetch` `getReader()` + `TextDecoder`,
buffering partial lines across reads (a JSON line can span chunks); the global/`apiFetch`
fetch does NOT support `getReader()`. Centralize this in a single `apiStream` helper so
token + 401-refresh logic isn't duplicated.

**Why:** the UI already groups items by key, so appending streamed items to existing
state fills the screen progressively with zero layout/design change.

**Gotchas:** guard against client disconnect (`req.on('close')` → flag, skip further
`res.write`) so an abandoned expensive AI call doesn't keep writing; do the action
buttons (save/etc.) only after streaming completes so the user can't save a partial
result; `res.write` inside `onProgress` happens after `flushHeaders`, so once streaming
starts you can only signal errors via an in-band `{type:'error'}` line, not an HTTP status.
