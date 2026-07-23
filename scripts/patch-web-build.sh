#!/usr/bin/env bash
# Patch post-export per web-build/index.html:
# - lang="it"
# - link al manifest PWA + icona Apple + theme-color
# Usato sia in locale sia dal build di pubblicazione (.replit [deployment]).
set -euo pipefail

DIR="${1:-web-build}"
INDEX="$DIR/index.html"

if [ ! -f "$INDEX" ]; then
  echo "ERRORE: $INDEX non trovato" >&2
  exit 1
fi

sed -i 's/<html lang="en"/<html lang="it"/' "$INDEX"

if ! grep -q 'rel="manifest"' "$INDEX"; then
  sed -i 's|</head>|<link rel="manifest" href="/manifest.json"/><link rel="apple-touch-icon" href="/icon-192.png"/><meta name="theme-color" content="#FF6B6B"/></head>|' "$INDEX"
fi

grep -q 'lang="it"' "$INDEX" && grep -q 'rel="manifest"' "$INDEX"
echo "OK: $INDEX patchato (lang=it + manifest PWA)"
