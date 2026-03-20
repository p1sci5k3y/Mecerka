#!/usr/bin/env sh

set -e

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/bootstrap-env.sh"

log() {
  printf '[bootstrap-demo-env] %s\n' "$1"
}

replace_or_append() {
  key="$1"
  value="$2"
  target="$3"

  if grep -q "^${key}=" "$target"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { prefix = key "=" }
      index($0, prefix) == 1 { print prefix value; next }
      { print }
    ' "$target" > "${target}.tmp"
    mv "${target}.tmp" "$target"
  else
    printf '%s=%s\n' "$key" "$value" >> "$target"
  fi
}

"$BOOTSTRAP_SCRIPT"

replace_or_append "DEMO_MODE" "true" "$ENV_FILE"

"$BOOTSTRAP_SCRIPT"

log "demo mode enabled in $ENV_FILE"
log "use 'docker compose up -d --build' to bootstrap the reproducible demo dataset"
