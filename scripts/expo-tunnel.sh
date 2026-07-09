#!/usr/bin/env bash
# Start Metro behind an ngrok tunnel so real Android devices (Expo Go) can connect.
#
# Why: Replit dev domains are HTTPS-only. Android's native packager status probe
# (http://HOST/status inside Expo Go) cannot negotiate the HTTPS-only Replit edge
# reliably, so "Simulate on Android" / the Expo Go QR fail with "Packager is not
# running". iOS and web work because they follow the http->https upgrade.
#
# ngrok exposes Metro over a public URL that serves BOTH http and https, so the
# Android probe and the manifest/bundle all reach Metro. We advertise that URL to
# Expo via EXPO_PACKAGER_PROXY_URL / REACT_NATIVE_PACKAGER_HOSTNAME.
#
# The Replit web preview keeps using the Replit domain (8081 -> externalPort 80),
# so it is unaffected by the tunnel.
set -euo pipefail

# Pin the ngrok version + its SHA256 so the downloaded binary is verified before
# we execute it (supply-chain protection). If ngrok is bumped, update BOTH values;
# a mismatch fails hard on purpose rather than running an unverified binary.
NGROK_VERSION="3.39.9"
NGROK_SHA256="d26c3fa5e2ca565cee77001e92a1940ebecbcf0cf9e2f8ad4319a429aaa1bf3f"
NGROK_DL="https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-${NGROK_VERSION}-stable-linux-amd64.tgz"

NGROK_DIR="node_modules/.cache/ngrok"
NGROK_BIN="$NGROK_DIR/ngrok"

# Kill any leftover ngrok from a previous run (frees the 4040 local API port).
pkill -f "$NGROK_BIN" 2>/dev/null || true
sleep 1

verify_bin() {
  [ -x "$NGROK_BIN" ] && \
    [ "$(sha256sum "$NGROK_BIN" | awk '{print $1}')" = "$NGROK_SHA256" ]
}

# Ensure a verified ngrok v3 binary is present. node_modules is git-ignored and
# Metro-ignored; it persists across restarts and is only wiped on npm install.
if ! verify_bin; then
  echo "[tunnel] downloading ngrok v${NGROK_VERSION}..."
  mkdir -p "$NGROK_DIR"
  curl -sL -o "$NGROK_DIR/ngrok.tgz" "$NGROK_DL"
  tar xzf "$NGROK_DIR/ngrok.tgz" -C "$NGROK_DIR"
  chmod +x "$NGROK_BIN"
  rm -f "$NGROK_DIR/ngrok.tgz"
  if ! verify_bin; then
    echo "[tunnel] ERROR: ngrok binary failed SHA256 verification (expected $NGROK_SHA256)." >&2
    echo "[tunnel] Refusing to run an unverified binary. Update NGROK_VERSION/NGROK_SHA256 if ngrok was bumped." >&2
    rm -f "$NGROK_BIN"
    exit 1
  fi
fi

if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
  echo "[tunnel] ERROR: NGROK_AUTHTOKEN is not set. Add it in Secrets." >&2
  exit 1
fi

if [ -z "${REPLIT_DEV_DOMAIN:-}" ]; then
  echo "[tunnel] ERROR: REPLIT_DEV_DOMAIN is not set; cannot resolve the backend API domain." >&2
  exit 1
fi

# ngrok v3 automatically reads NGROK_AUTHTOKEN from the environment.
"$NGROK_BIN" http 8081 --log stdout --log-level warn > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Ensure ngrok is stopped whenever this script (and Expo) exits or is restarted.
cleanup() { kill "$NGROK_PID" 2>/dev/null || true; }
trap cleanup EXIT

# Wait for ngrok to publish its https URL via the local API.
TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(''); sys.exit(0)
print(next((t['public_url'] for t in d.get('tunnels', []) if t.get('public_url','').startswith('https')), ''))
" 2>/dev/null || true)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[tunnel] ERROR: could not obtain an ngrok URL. ngrok log:" >&2
  cat /tmp/ngrok.log >&2 || true
  exit 1
fi

TUNNEL_HOST="${TUNNEL_URL#https://}"
echo "[tunnel] ================================================================"
echo "[tunnel] Metro is tunneled at: $TUNNEL_URL"
echo "[tunnel] Scan the Expo Go QR below on Android to connect."
echo "[tunnel] ================================================================"

export EXPO_PACKAGER_PROXY_URL="$TUNNEL_URL"
export REACT_NATIVE_PACKAGER_HOSTNAME="$TUNNEL_HOST"
export EXPO_PUBLIC_DOMAIN="$REPLIT_DEV_DOMAIN:5000"

# Run Expo in the foreground and forward termination signals so a workflow
# restart shuts down cleanly (and the EXIT trap stops ngrok, no orphans).
npx expo start --localhost &
EXPO_PID=$!
trap 'kill -TERM "$EXPO_PID" 2>/dev/null || true; cleanup' TERM INT
wait "$EXPO_PID"
