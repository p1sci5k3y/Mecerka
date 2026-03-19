#!/usr/bin/env sh

set -e

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.example"

log() {
  printf '[bootstrap-env] %s\n' "$1"
}

read_value() {
  key="$1"
  target="$2"

  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "", $0)
      print $0
      exit
    }
  ' "$target"
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

if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
  log "error: missing template $ENV_EXAMPLE_FILE"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  log "creating .env from .env.example"
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
else
  log ".env already exists at $ENV_FILE; repairing missing required values only"
fi

generated_keys=""

POSTGRES_PASSWORD=$(read_value "POSTGRES_PASSWORD" "$ENV_FILE")
if [ -z "$POSTGRES_PASSWORD" ]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  replace_or_append "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD" "$ENV_FILE"
  generated_keys="$generated_keys POSTGRES_PASSWORD"
fi

JWT_SECRET=$(read_value "JWT_SECRET" "$ENV_FILE")
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  replace_or_append "JWT_SECRET" "$JWT_SECRET" "$ENV_FILE"
  generated_keys="$generated_keys JWT_SECRET"
fi

JWT_SECRET_CURRENT=$(read_value "JWT_SECRET_CURRENT" "$ENV_FILE")
if [ -z "$JWT_SECRET_CURRENT" ]; then
  JWT_SECRET_CURRENT=$JWT_SECRET
  replace_or_append "JWT_SECRET_CURRENT" "$JWT_SECRET_CURRENT" "$ENV_FILE"
  generated_keys="$generated_keys JWT_SECRET_CURRENT"
fi

FISCAL_PEPPER=$(read_value "FISCAL_PEPPER" "$ENV_FILE")
if [ -z "$FISCAL_PEPPER" ]; then
  FISCAL_PEPPER=$(openssl rand -hex 32)
  replace_or_append "FISCAL_PEPPER" "$FISCAL_PEPPER" "$ENV_FILE"
  generated_keys="$generated_keys FISCAL_PEPPER"
fi

DATABASE_URL=$(read_value "DATABASE_URL" "$ENV_FILE")
if [ -z "$DATABASE_URL" ]; then
  POSTGRES_USER=$(read_value "POSTGRES_USER" "$ENV_FILE")
  POSTGRES_DB=$(read_value "POSTGRES_DB" "$ENV_FILE")
  [ -n "$POSTGRES_USER" ] || POSTGRES_USER=postgres
  [ -n "$POSTGRES_DB" ] || POSTGRES_DB=marketplace
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
  replace_or_append "DATABASE_URL" "$DATABASE_URL" "$ENV_FILE"
  generated_keys="$generated_keys DATABASE_URL"
fi

replace_or_append "DEMO_MODE" "false" "$ENV_FILE"

if [ -n "$generated_keys" ]; then
  log "generated missing values for:$generated_keys"
else
  log "all required local secrets were already present"
fi
log "DEMO_MODE defaults to false. Set it to true manually only for intentional demo workflows."
log ".env is ready"
