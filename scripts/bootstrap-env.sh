#!/usr/bin/env sh

set -e

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"

log() {
  printf '[bootstrap-env] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "error: required command '$1' is not available"
    exit 1
  fi
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

require_command openssl

if [ -f "$ENV_FILE" ]; then
  log ".env already exists at $ENV_FILE; nothing to do"
  exit 0
fi

if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
  log "error: missing template $ENV_EXAMPLE_FILE"
  exit 1
fi

log "creating .env from .env.example"
cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"

POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
JWT_SECRET_CURRENT=$JWT_SECRET
FISCAL_PEPPER=$(openssl rand -hex 32)
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/marketplace"

replace_or_append "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD" "$ENV_FILE"
replace_or_append "DATABASE_URL" "$DATABASE_URL" "$ENV_FILE"
replace_or_append "DEMO_MODE" "false" "$ENV_FILE"
replace_or_append "JWT_SECRET" "$JWT_SECRET" "$ENV_FILE"
replace_or_append "JWT_SECRET_CURRENT" "$JWT_SECRET_CURRENT" "$ENV_FILE"
replace_or_append "FISCAL_PEPPER" "$FISCAL_PEPPER" "$ENV_FILE"

log "generated POSTGRES_PASSWORD, JWT_SECRET, JWT_SECRET_CURRENT, and FISCAL_PEPPER"
log "DEMO_MODE defaults to false. Set it to true manually only for intentional demo workflows."
log ".env created successfully"
