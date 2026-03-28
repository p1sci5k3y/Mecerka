#!/usr/bin/env sh

set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <PREFIX> <OUTPUT_FILE>" >&2
  exit 1
fi

PREFIX="$1"
OUTPUT_FILE="$2"

read_prefixed() {
  key="$1"
  value="$(printenv "${PREFIX}_${key}" || true)"
  if [ -z "${value}" ]; then
    echo "missing required env: ${PREFIX}_${key}" >&2
    exit 1
  fi
  printf '%s' "$value"
}

read_optional_prefixed() {
  key="$1"
  default_value="${2:-}"
  value="$(printenv "${PREFIX}_${key}" || true)"
  if [ -z "${value}" ]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

urlencode() {
  python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

POSTGRES_USER="$(read_prefixed POSTGRES_USER)"
POSTGRES_PASSWORD="$(read_prefixed POSTGRES_PASSWORD)"
POSTGRES_DB="$(read_prefixed POSTGRES_DB)"
JWT_SECRET="$(read_prefixed JWT_SECRET)"
JWT_SECRET_CURRENT="$(read_prefixed JWT_SECRET_CURRENT)"
SYSTEM_SETTINGS_MASTER_KEY="$(read_prefixed SYSTEM_SETTINGS_MASTER_KEY)"
FISCAL_PEPPER="$(read_prefixed FISCAL_PEPPER)"
NEXT_PUBLIC_API_URL="$(read_prefixed NEXT_PUBLIC_API_URL)"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$(read_prefixed NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)"
CORS_ORIGIN="$(read_prefixed CORS_ORIGIN)"
FRONTEND_URL="$(read_prefixed FRONTEND_URL)"
STRIPE_SECRET_KEY="$(read_prefixed STRIPE_SECRET_KEY)"
STRIPE_WEBHOOK_SECRET="$(read_prefixed STRIPE_WEBHOOK_SECRET)"
DELIVERY_STRIPE_WEBHOOK_SECRET="$(read_prefixed DELIVERY_STRIPE_WEBHOOK_SECRET)"
DONATIONS_STRIPE_WEBHOOK_SECRET="$(read_prefixed DONATIONS_STRIPE_WEBHOOK_SECRET)"
BACKEND_URL="$(read_prefixed BACKEND_URL)"
MAIL_HOST="$(read_prefixed MAIL_HOST)"
MAIL_PORT="$(read_prefixed MAIL_PORT)"
MAIL_USER="$(read_optional_prefixed MAIL_USER)"
MAIL_PASS="$(read_optional_prefixed MAIL_PASS)"
MAIL_FROM="$(read_prefixed MAIL_FROM)"
DEMO_MODE="$(read_prefixed DEMO_MODE)"
BACKEND_IMAGE="$(read_prefixed BACKEND_IMAGE)"
FRONTEND_IMAGE="$(read_prefixed FRONTEND_IMAGE)"
BACKEND_HOST_PORT="$(read_prefixed BACKEND_HOST_PORT)"
FRONTEND_HOST_PORT="$(read_prefixed FRONTEND_HOST_PORT)"
NEXT_PUBLIC_REQUIRE_MFA="$(read_optional_prefixed NEXT_PUBLIC_REQUIRE_MFA false)"
DEMO_PASSWORD="$(read_optional_prefixed DEMO_PASSWORD)"

if [ "$DEMO_MODE" = "true" ] && [ -z "$DEMO_PASSWORD" ]; then
  echo "DEMO_PASSWORD is required when ${PREFIX}_DEMO_MODE=true" >&2
  exit 1
fi

ENCODED_PASSWORD="$(urlencode "$POSTGRES_PASSWORD")"
DATABASE_URL="postgresql://${POSTGRES_USER}:${ENCODED_PASSWORD}@postgres:5432/${POSTGRES_DB}"

umask 077
: > "$OUTPUT_FILE"

write_value() {
  key="$1"
  value="$2"
  printf '%s=%s\n' "$key" "$value" >> "$OUTPUT_FILE"
}

write_value POSTGRES_USER "$POSTGRES_USER"
write_value POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
write_value POSTGRES_DB "$POSTGRES_DB"
write_value DATABASE_URL "$DATABASE_URL"
write_value API_BASE_URL "/api"
write_value STRIPE_PUBLISHABLE_KEY "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
write_value JWT_SECRET "$JWT_SECRET"
write_value JWT_SECRET_CURRENT "$JWT_SECRET_CURRENT"
write_value SYSTEM_SETTINGS_MASTER_KEY "$SYSTEM_SETTINGS_MASTER_KEY"
write_value FISCAL_PEPPER "$FISCAL_PEPPER"
write_value NEXT_PUBLIC_API_URL "$NEXT_PUBLIC_API_URL"
write_value NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
write_value NEXT_PUBLIC_REQUIRE_MFA "$NEXT_PUBLIC_REQUIRE_MFA"
write_value CORS_ORIGIN "$CORS_ORIGIN"
write_value FRONTEND_URL "$FRONTEND_URL"
write_value STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY"
write_value STRIPE_WEBHOOK_SECRET "$STRIPE_WEBHOOK_SECRET"
write_value DELIVERY_STRIPE_WEBHOOK_SECRET "$DELIVERY_STRIPE_WEBHOOK_SECRET"
write_value DONATIONS_STRIPE_WEBHOOK_SECRET "$DONATIONS_STRIPE_WEBHOOK_SECRET"
write_value BACKEND_URL "$BACKEND_URL"
write_value WS_CORS_ORIGIN "$FRONTEND_URL"
write_value MAIL_HOST "$MAIL_HOST"
write_value MAIL_PORT "$MAIL_PORT"
write_value MAIL_USER "$MAIL_USER"
write_value MAIL_PASS "$MAIL_PASS"
write_value MAIL_FROM "$MAIL_FROM"
write_value DEMO_MODE "$DEMO_MODE"
write_value DEMO_PASSWORD "$DEMO_PASSWORD"
write_value BACKEND_IMAGE "$BACKEND_IMAGE"
write_value FRONTEND_IMAGE "$FRONTEND_IMAGE"
write_value BACKEND_HOST_PORT "$BACKEND_HOST_PORT"
write_value FRONTEND_HOST_PORT "$FRONTEND_HOST_PORT"
