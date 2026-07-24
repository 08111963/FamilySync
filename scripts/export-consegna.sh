#!/usr/bin/env bash
# Crea lo ZIP di consegna del progetto ESCLUDENDO segreti, credenziali,
# contenuti utente, build e archivi precedenti.
# Uso: bash scripts/export-consegna.sh [nome-zip]
set -euo pipefail

OUT="${1:-familysync-consegna-v2.1.zip}"
cd "$(dirname "$0")/.."

rm -f "$OUT"

zip -r "$OUT" . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".expo/*" \
  -x "dist/*" \
  -x "web-build/*" \
  -x "server_dist/*" \
  -x "static-build/*" \
  -x "uploads/*" \
  -x "exports/*" \
  -x "attached_assets/*" \
  -x ".local/*" \
  -x ".agents/*" \
  -x "tmp/*" \
  -x "*.zip" \
  -x "*.log" \
  -x ".env*" \
  -x ".replit" \
  -x ".replit.*" \
  -x "*.pem" -x "*.key" -x "*.p8" -x "*.p12" -x "*.jks" -x "*.mobileprovision" \
  -x "*vapid*" \
  -x "*.private.*" \
  -x "docs/tester-accounts.pdf" \
  -x ".cache/*" -x ".upm/*" -x ".config/*" \
  -x ".DS_Store"

# Scansione di sicurezza 1: nomi file sensibili nello ZIP.
if unzip -l "$OUT" | awk '{print $4}' | grep -Ei "tester-accounts\.pdf|(^|/)\.env($|\.)|(^|/)\.replit($|\.)|vapid|\.pem$|\.p8$|\.p12$|\.jks$|\.key$|\.private\."; then
  echo "ERRORE: trovati file sensibili nello ZIP (per nome). Consegna annullata." >&2
  rm -f "$OUT"
  exit 1
fi

# Scansione di sicurezza 2: contenuti — nessun valore di segreto noto nei file inclusi.
TMPDIR_SCAN="$(mktemp -d)"
unzip -qq "$OUT" -d "$TMPDIR_SCAN"
if grep -RInE "BEGIN (RSA |EC )?PRIVATE KEY|VAPID_PRIVATE_KEY[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_-]{20,}|(API_KEY|SECRET|TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_/+-]{24,}" \
    "$TMPDIR_SCAN" --exclude-dir=node_modules 2>/dev/null | grep -v "process\.env" | head -5; then
  FOUND=1
else
  FOUND=0
fi
rm -rf "$TMPDIR_SCAN"
if [ "$FOUND" = "1" ]; then
  echo "ERRORE: possibili segreti nei contenuti dello ZIP. Consegna annullata." >&2
  rm -f "$OUT"
  exit 1
fi

echo "Creato $OUT (senza segreti, credenziali, upload o build)."
