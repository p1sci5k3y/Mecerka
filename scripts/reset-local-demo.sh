#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"

log() {
  printf '[reset-local-demo] %s\n' "$1"
}

read_env_value() {
  key="$1"
  python3 - "$ENV_FILE" "$key" <<'PY'
import pathlib
import sys

env_path = pathlib.Path(sys.argv[1])
key = sys.argv[2]

for raw_line in env_path.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    current_key, value = line.split("=", 1)
    if current_key == key:
        print(value)
        raise SystemExit(0)

raise SystemExit(1)
PY
}

wait_for_health() {
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done

  echo "backend health check failed after waiting for startup" >&2
  exit 1
}

log "enabling demo mode in local .env"
"$ROOT_DIR/scripts/bootstrap-demo-env.sh"

log "resetting local containers and demo database volume"
cd "$ROOT_DIR"
docker compose down -v --remove-orphans

log "bootstrapping a fresh local demo stack"
docker compose up -d --build

wait_for_health

PRODUCT_COUNT="$(curl -fsS http://localhost:3000/products | python3 -c 'import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else int(data.get("total", 0)))')"
if [ "${PRODUCT_COUNT}" -le 0 ]; then
  echo "demo catalog is empty after reset" >&2
  exit 1
fi

DEMO_PASSWORD="$(read_env_value DEMO_PASSWORD)"
LOGIN_STATUS="$(python3 - "$DEMO_PASSWORD" <<'PY'
import http.client
import json
import sys

password = sys.argv[1]
payload = json.dumps({
    "email": "user.demo@local.test",
    "password": password,
}).encode()

conn = http.client.HTTPConnection("localhost", 3000, timeout=10)
conn.request("POST", "/auth/login", payload, {
    "Content-Type": "application/json",
})
response = conn.getresponse()
print(response.status)
PY
)"

if [ "$LOGIN_STATUS" != "201" ]; then
  echo "demo login failed after reset (status=$LOGIN_STATUS)" >&2
  exit 1
fi

log "demo reset complete: products=$PRODUCT_COUNT demo login=OK"
