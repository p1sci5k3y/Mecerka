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

retry() {
  attempts="$1"
  delay="$2"
  shift 2

  i=1
  while [ "$i" -le "$attempts" ]; do
    if "$@"; then
      return 0
    fi
    if [ "$i" -eq "$attempts" ]; then
      break
    fi
    sleep "$delay"
    i=$((i + 1))
  done

  return 1
}

http_ok() {
  curl -fsS "$1" >/dev/null
}

http_head_ok() {
  curl -fsSI "$1" >/dev/null
}

retry 10 3 http_ok "http://127.0.0.1:${BACKEND_HOST_PORT}/health"
retry 10 3 http_head_ok "http://127.0.0.1:${FRONTEND_HOST_PORT}"

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
