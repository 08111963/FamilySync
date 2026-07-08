#!/bin/bash
set -euo pipefail

# Post-merge setup for FamilySync.
# Runs automatically after a task is merged into main.
# Must be idempotent and non-interactive (stdin is closed).

echo "[post-merge] Installing dependencies..."
npm install --no-audit --no-fund

# Replit's package manager can rewrite lockfile 'resolved' URLs to the internal
# proxy (package-firewall.replit.local), which is unreachable on external CI
# (EAS/GitHub) and crashes `npm ci`. Rewrite them back to the public registry so
# AAB/IPA cloud builds keep working after merges.
echo "[post-merge] Normalizing package-lock.json resolved URLs..."
sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json

echo "[post-merge] Applying Drizzle schema to the database..."
npm run db:push

echo "[post-merge] Done."
