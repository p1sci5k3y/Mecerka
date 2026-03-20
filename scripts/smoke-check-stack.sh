#!/usr/bin/env sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <ENV_FILE>" >&2
  exit 1
fi

ENV_FILE="$1"

read_value() {
  key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "", $0)
      print $0
      exit
    }
  ' "$ENV_FILE"
}

BACKEND_HOST_PORT="$(read_value BACKEND_HOST_PORT)"
FRONTEND_HOST_PORT="$(read_value FRONTEND_HOST_PORT)"
DEMO_MODE="$(read_value DEMO_MODE)"

curl -fsS "http://127.0.0.1:${BACKEND_HOST_PORT}/health" >/dev/null
curl -fsSI "http://127.0.0.1:${FRONTEND_HOST_PORT}" >/dev/null

if [ "$DEMO_MODE" = "true" ]; then
  python3 - <<'PY' "http://127.0.0.1:${BACKEND_HOST_PORT}/products"
import json
import sys
import urllib.request

url = sys.argv[1]
with urllib.request.urlopen(url, timeout=15) as response:
    payload = json.load(response)

if not isinstance(payload, list) or len(payload) == 0:
    raise SystemExit("demo smoke check failed: /products returned no items")
PY
fi
