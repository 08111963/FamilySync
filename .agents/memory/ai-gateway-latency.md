---
name: AI gateway latency is throughput-bound
description: Why AI generation felt slow / "generated nothing" and the parallelization fix
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
