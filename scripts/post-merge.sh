#!/bin/bash
set -euo pipefail

# Post-merge setup for FamilySync.
# Runs automatically after a task is merged into main.
# Must be idempotent and non-interactive (stdin is closed).

echo "[post-merge] Installing dependencies..."
npm install --no-audit --no-fund

echo "[post-merge] Applying Drizzle schema to the database..."
npm run db:push

echo "[post-merge] Done."
