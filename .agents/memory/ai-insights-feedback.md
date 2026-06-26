---
name: AI insights screen — silent failures
description: Why "AI doesn't give suggestions" reports happen and the feedback rule for AI calls
---

# AI suggestions appear to do nothing

- **OpenAI is reached via Replit integration env vars** `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` (NOT `OPENAI_API_KEY`, which is absent and is a red herring). A direct `openai.chat.completions.create` test confirms the integration works.
- **Server-side AI lib swallows errors**: each function in `server/lib/openai.ts` catches and returns empty (`{items:[]}`, `{assignments:[]}`, etc.) instead of throwing. Shopping suggestions also have a hardcoded FALLBACK_POOL so they should never be truly empty.

## Rule: AI handlers must surface failures to the user
- **Why:** the user-facing screen previously only showed a banner for the `AI_DISABLED` (403) case; every other failure (network/500) was `console.error` only → button spins then nothing → reported as "AI non dà suggerimenti".
- **How to apply:** in any AI action handler, the catch must set a visible error message (not just log) for the non-AI_DISABLED branch, reset it at action start / tab change / refresh, and render an error banner. Keep `AI_DISABLED` banner dominant over the generic error banner.
