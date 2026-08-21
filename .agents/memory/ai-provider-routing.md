---
name: AI provider routing
description: Policy for selecting the OpenAI provider by authenticated family role and execution context.
---

Direct OpenAI is an admin-only, server-side per-request pilot. Resolve the role
from the trusted family membership, never from client input: an `admin` uses
direct OpenAI only when the personal key is configured; every other role and
all background work use Replit Managed AI. An admin missing the personal key
must fall back to Replit Managed AI.

**Why:** this lets an administrator validate direct-provider billing without
moving ordinary family data or unattended jobs away from the existing managed
provider, and avoids accidental cross-request credential selection.

**How to apply:** pass a provider explicitly into AI operations and quota
reservation; keep separate clients per provider. Default any call without a
trusted interactive user to Replit Managed AI. Logs may record only provider,
operation, and coarse role—never credentials, prompts, base URLs, IDs, or
family data.