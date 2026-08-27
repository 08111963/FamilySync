---
name: EAS build queue and Git refs
description: Distinguishes local CLI builds from GitHub-triggered builds and prevents downloading an older queued build.
---

EAS builds started from the local workspace can show only the commit hash (and a dirty marker) in the Git ref column, even when the local branch is `main`; GitHub-triggered builds commonly show `main` plus the hash.

**Why:** Multiple EAS builds may remain queued or finish out of order, so a generic “Build finished” message can refer to an older build rather than the newest requested one.

**How to apply:** Always verify the build ID, profile, commit hash, archive size, and artifact URL with `eas build:view` before downloading an AAB. Ignore an older finished artifact if it predates the intended archive or code change.