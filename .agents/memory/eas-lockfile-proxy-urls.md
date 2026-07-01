---
name: EAS/CI lockfile proxy URLs
description: npm ci crashes on external CI (EAS "Build from GitHub", GitHub Actions) when package-lock.json resolved URLs point to Replit's internal proxy
---

# `npm ci` crash on EAS/external CI: `package-firewall.replit.local` in the lockfile

**Symptom:** EAS cloud build (or any non-Replit CI) fails in the "Install dependencies" step running `npm ci --include=dev`, crashing with `npm error Exit handler never called!` after ~1 min, right after deprecation warnings. Exit code shown as 1. Works fine inside Replit.

**Root cause:** Replit's package manager (UPM) can write `resolved` URLs into `package-lock.json` that point to Replit's internal proxy `http://package-firewall.replit.local/npm/<pkg>/-/<file>.tgz`. That host is ONLY reachable inside Replit. On EAS/GitHub CI it doesn't resolve, npm fails to fetch the tarball, and its buggy error path surfaces the generic "Exit handler never called!" instead of a clear network error. The lockfile often has a MIX: most entries use `registry.npmjs.org`, a subset use the proxy host.

**Why not obvious:** top-level package.json↔lock sync check passes (all deps present, versions match); the problem is only in nested `resolved` URLs. Pinning the Node version does NOT fix it (identical crash).

**Fix:** rewrite every proxy URL to the public registry — same tarballs, same integrity hashes (the proxy just fronts npmjs.org), so NO version changes:
```
sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json
```
Then validate JSON, confirm 0 remaining `package-firewall.replit.local`, and confirm no `.npmrc` forces `registry=...replit.local`. Commit + push to GitHub before re-running the EAS build.

**How to detect fast:** `rg -c 'package-firewall\.replit\.local' package-lock.json`. Any count > 0 will break external CI.
