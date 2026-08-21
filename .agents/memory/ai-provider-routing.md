---
name: AI provider routing
description: Policy for selecting the OpenAI provider by authenticated user-ID allowlist and execution context.
---

Direct OpenAI is a server-side, per-request pilot selected only through
`OPENAI_DIRECT_PILOT_USER_IDS`, a comma-separated allowlist of internal user
IDs. The authenticated user ID must appear in that allowlist and the direct
key must be configured; otherwise every interactive request uses Replit
Managed AI. Family roles never influence provider selection, and all background
work always uses Replit Managed AI.

**Why:** a family `admin` is not necessarily the app owner. Restricting direct
provider access by membership role could expose the owner's personal provider
key to unrelated family administrators.

**How to apply:** pass a provider explicitly into AI operations and quota
reservation; keep separate clients per provider. Default any call without a
trusted allowlisted user to Replit Managed AI. Logs may record only provider,
operation, and a boolean pilot flag—never credentials, prompts, base URLs,
IDs, or family data.