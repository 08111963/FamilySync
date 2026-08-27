---
name: Replit GitHub Git authentication
description: The Replit Git pane and shell Git client may use separate credentials for the same GitHub remote.
---

The GitHub connection can appear Active in Replit while terminal `git push` still fails because the shell remote has no usable HTTPS or SSH credential. The Git pane may continue to work after reconnecting the Git provider.

**Why:** The connector/API authorization and the Git transport credential are separate paths; a successful GitHub API call does not prove that shell Git can authenticate.

**How to apply:** When shell push returns `UNAUTHENTICATED`, use the Replit Git pane and, if needed, disconnect/reconnect GitHub in Git provider settings. Verify completion by confirming the pane has no pending sync changes and comparing the GitHub branch HEAD with the workspace HEAD.