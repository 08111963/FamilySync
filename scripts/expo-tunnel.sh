#!/usr/bin/env bash
# Start Metro behind a tunnel so real Android devices (Expo Go) can connect.
#
# Why: Replit dev domains are HTTPS-only. Android's native packager status probe
# (http://HOST/status inside Expo Go) cannot negotiate the HTTPS-only Replit edge
# reliably, so "Simulate on Android" / the Expo Go QR fail with "Packager is not
# running". iOS and web work because they follow the http->https upgrade.
#
# We use Expo's built-in tunnel (`expo start --tunnel`, via @expo/ngrok under
# Expo's account) which serves both http and https and has no per-user ngrok
# bandwidth cap. Our previous personal-ngrok setup hit the free-plan monthly
# bandwidth limit (ERR_NGROK_725), killing device connectivity.
#
# The Replit web preview keeps using the Replit domain (8081 -> externalPort 80),
# so it is unaffected by the tunnel.
set -euo pipefail

if [ -z "${REPLIT_DEV_DOMAIN:-}" ]; then
  echo "[tunnel] ERROR: REPLIT_DEV_DOMAIN is not set; cannot resolve the backend API domain." >&2
  exit 1
fi

# Kill any leftover personal ngrok from previous runs (frees port 4040).
pkill -f "node_modules/.cache/ngrok/ngrok" 2>/dev/null || true

# Free ports 8081/8082 from any previous Expo/Metro/proxy instance that
# survived a workflow restart, otherwise expo/proxy exit with "port in use".
pkill -f "expo start" 2>/dev/null || true
pkill -f "preview-proxy.cjs" 2>/dev/null || true
sleep 1
fuser -k 8081/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
# Aspetta che le porte siano davvero libere (kill asincrono) per evitare EADDRINUSE.
for i in $(seq 1 20); do
  if ! fuser 8081/tcp 2>/dev/null && ! fuser 8082/tcp 2>/dev/null; then
    break
  fi
  fuser -k -9 8081/tcp 2>/dev/null || true
  fuser -k -9 8082/tcp 2>/dev/null || true
  sleep 0.5
done

# Sul telefono si raggiunge il proxy pubblico (443 → backend 5000), non la
# porta interna 5000 che non è esposta direttamente fuori da Replit.
export EXPO_PUBLIC_DOMAIN="$REPLIT_DEV_DOMAIN"

# Lascia che Expo generi il proprio URL exp.direct. Forzare un sottodominio
# ngrok.io riusa il vecchio backend tunnel e può fallire con "remote gone away".
unset EXPO_TUNNEL_SUBDOMAIN || true

# Ponte anteprima: la porta 8081 (esterna 80) deve servire il BACKEND (5000),
# come in produzione — Metro qui serviva bundle dev stantii e rompeva l'OAuth.
# Metro viene spostato sulla porta 8082 (solo per il tunnel Expo Go).
node scripts/preview-proxy.cjs &
PROXY_PID=$!

echo "[tunnel] Starting Expo with its built-in tunnel (exp.direct) on port 8082."
echo "[tunnel] Scan the Expo Go QR below on Android to connect."

# Run Expo in the foreground and forward termination signals so a workflow
# restart shuts down cleanly.
# Expo può fallire (es. tunnel giù) senza compromettere l'anteprima web:
# il processo "principale" del workflow è il proxy, non Metro.
npx expo start --tunnel --port 8082 &
EXPO_PID=$!
trap 'kill -TERM "$EXPO_PID" "$PROXY_PID" 2>/dev/null || true' TERM INT
wait "$PROXY_PID"
