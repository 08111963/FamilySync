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

# Scansione di sicurezza 2: contenuti — eseguita SULLO ZIP FINALE già creato
# (estratto in cartella temporanea), non sulla cartella sorgente.
TMPDIR_SCAN="$(mktemp -d)"
unzip -qq "$OUT" -d "$TMPDIR_SCAN"
FOUND=0

# NB: nessuna pipeline con `head` dentro le condizioni (con pipefail il SIGPIPE
# potrebbe mascherare le match): l'output viene catturato in variabile e
# controllato con [ -n ].

# 2a. Chiavi private e valori di segreti noti (qualsiasi file).
MATCHES_2A="$(grep -RInE "BEGIN (RSA |EC )?PRIVATE KEY|VAPID_PRIVATE_KEY[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_-]{20,}|(API_KEY|SECRET|TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_/+-]{24,}" \
    "$TMPDIR_SCAN" --exclude-dir=node_modules 2>/dev/null | grep -v "process\.env" || true)"
if [ -n "$MATCHES_2A" ]; then
  printf '%s\n' "$MATCHES_2A" | head -5
  FOUND=1
fi

# 2b. Credenziali hardcoded in codice/config/docs: password: "..." o password: '...'
# (anche corte, min 4 caratteri) nei file .js .mjs .ts .tsx .json .md.
# I file di test SONO inclusi nella scansione: sono ammesse SOLO le password
# fittizie note dell'allowlist qui sotto (e solo dentro __tests__/).
TEST_DUMMY_PW="Abcdef12|BrandNew123|OldPass123|Qualsiasi123|RightPass123|StrongPass123|WrongPass123|weak"
MATCHES_2B="$(grep -RInE "password['\"]?[[:space:]]*[:=][[:space:]]*['\"][^'\"]{4,}['\"]" \
    "$TMPDIR_SCAN" --include="*.js" --include="*.mjs" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" \
    --exclude-dir=node_modules 2>/dev/null \
  | grep -vE "process\.env|placeholder|PASSWORD_PLACEHOLDER|La tua password|password[s]?\.|type=|secureTextEntry|autoComplete|new-password|current-password|\\*\\*\\*|esempio|Esempio" \
  | grep -vE "__tests__/[^:]+:[0-9]+:.*password['\"]?[[:space:]]*[:=][[:space:]]*['\"](${TEST_DUMMY_PW})['\"]" || true)"
if [ -n "$MATCHES_2B" ]; then
  printf '%s\n' "$MATCHES_2B" | head -5
  FOUND=1
fi

# 2c. Coppie email+password vicine (entro 3 righe) negli stessi tipi di file
# (inclusi i file di test).
for f in $(grep -RIlE "password" "$TMPDIR_SCAN" --include="*.js" --include="*.mjs" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" --exclude-dir=node_modules 2>/dev/null); do
  if awk '
      /process\.env/ { next }
      tolower($0) ~ /["'"'"'][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}["'"'"']/ { e = NR }
      tolower($0) ~ /password["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']/ {
        if (e && NR - e <= 3) found = 1
      }
      END { exit found ? 0 : 1 }
    ' "$f"; then
    echo "Possibile coppia email+password in: ${f#$TMPDIR_SCAN/}"
    FOUND=1
  fi
done

# 2d. PDF inclusi nello ZIP: verifica testo estraibile alla ricerca di credenziali.
for f in $(find "$TMPDIR_SCAN" -name "*.pdf" 2>/dev/null); do
  if command -v pdftotext >/dev/null 2>&1; then
    MATCHES_PDF="$(pdftotext "$f" - 2>/dev/null | grep -iE "password[[:space:]]*[:=]" || true)"
    if [ -n "$MATCHES_PDF" ]; then
      printf '%s\n' "$MATCHES_PDF" | head -2
      echo "Possibili credenziali nel PDF: ${f#$TMPDIR_SCAN/}"
      FOUND=1
    fi
  else
    # Senza pdftotext: nessun PDF ammesso per prudenza, salvo whitelist.
    case "$(basename "$f")" in
      guida-utente*.pdf) : ;;
      *) echo "PDF non verificabile nello ZIP: ${f#$TMPDIR_SCAN/}"; FOUND=1 ;;
    esac
  fi
done

rm -rf "$TMPDIR_SCAN"
if [ "$FOUND" = "1" ]; then
  echo "ERRORE: possibili segreti o credenziali nei contenuti dello ZIP. Consegna annullata." >&2
  rm -f "$OUT"
  exit 1
fi

echo "Creato $OUT (senza segreti, credenziali, upload o build)."
