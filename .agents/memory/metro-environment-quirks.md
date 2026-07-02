---
name: Metro environment quirks (Replit Expo)
description: Two non-obvious Metro failures in this Replit Expo project and their fixes — the .local watcher crash and false unresolved-module errors after installing native modules.
---

# Metro / Expo environment quirks

## 1. FallbackWatcher ENOENT crash on `.local`
Symptom: `Start Frontend` dies at startup with
`Error: ENOENT ... watch '/home/runner/workspace/.local/state/workflow-logs/<id>'`
thrown from `metro-file-map/.../FallbackWatcher`.

**Why:** there is no watchman here, so Metro uses FallbackWatcher and recursively walks the
whole project root. `.local/state/workflow-logs/` holds ephemeral workflow-log files that get
created/deleted constantly (each workflow restart + refresh_all_logs churns them). If a file
disappears mid-walk, fs.watch throws ENOENT and crashes the process. It only surfaces after a
**cold cache clear** (deleting Metro caches), because a warm haste-map skips re-walking those dirs.

**How to apply:** keep `.local` excluded from Metro in `metro.config.js` via
`config.resolver.blockList` (array of RegExp, e.g. `/.*[\\/]\.local[\\/].*/`). Do NOT
`require("metro-config/src/defaults/exclusionList")` — that subpath is not in the package's
`exports` in this Metro version and throws ERR_PACKAGE_PATH_NOT_EXPORTED. Just hand blockList a
plain array of RegExp (merge with any existing default blockList).

## 2. False "Unable to resolve module" after installing native Expo modules
After installing new Expo packages (e.g. expo-notifications pulling in expo-application), Metro
may report `Unable to resolve module ./Application.types` even though the file exists on disk.
This is a stale Metro file-map/transform cache. Fix: clear caches
(`rm -rf node_modules/.cache /tmp/metro-*`) and restart the frontend workflow. Verify the file
truly exists first so you don't chase a phantom version mismatch.

**Note:** `/tmp/logs/*.log` are snapshots written by `refresh_all_logs`, NOT live workflow output.
Tailing them after a restart shows stale errors — call `refresh_all_logs` to get the current state.

## Processi in background uccisi tra tool call
Detached/nohup/setsid background processes (e.g. `npx expo export` in background) get killed between agent tool calls — the log file may even vanish. **How to apply:** run long builds like `expo export` synchronously with the swap chained in one command (`export && rm -rf web-build && mv`); it completes within the ~2min timeout even if the tool reports timeout.
