#!/usr/bin/env sh
set -eu

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-mecerka.me}"
WWW_DOMAIN="${WWW_DOMAIN:-www.mecerka.me}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.mecerka.me}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
CERT_PATH="/etc/letsencrypt/live/${PRIMARY_DOMAIN}/fullchain.pem"

if [ -z "$LETSENCRYPT_EMAIL" ]; then
  echo "LETSENCRYPT_EMAIL is required to manage TLS certificates" >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1 || ! command -v dig >/dev/null 2>&1; then
  echo "certbot and dig must be installed before running ensure-dual-tls.sh" >&2
  exit 1
fi

resolve_ipv4() {
  domain="$1"
  dig +short "$domain" @1.1.1.1 | awk '/^[0-9.]+$/ { print; exit }'
}

PRIMARY_IP="$(resolve_ipv4 "$PRIMARY_DOMAIN")"
DEMO_IP="$(resolve_ipv4 "$DEMO_DOMAIN")"

if [ -z "$PRIMARY_IP" ]; then
  echo "Public DNS check failed: ${PRIMARY_DOMAIN} does not resolve to an IPv4 address" >&2
  exit 1
fi

if [ -z "$DEMO_IP" ]; then
  echo "Public DNS check failed: ${DEMO_DOMAIN} does not resolve publicly. Create its DNS record before deploy." >&2
  exit 1
fi

if [ "$PRIMARY_IP" != "$DEMO_IP" ]; then
  echo "Public DNS check failed: ${DEMO_DOMAIN} resolves to ${DEMO_IP}, but ${PRIMARY_DOMAIN} resolves to ${PRIMARY_IP}. Both must point to the same host for the dual deploy." >&2
  exit 1
fi

DOMAINS_ARGS="
  -d ${PRIMARY_DOMAIN}
  -d ${WWW_DOMAIN}
  -d ${DEMO_DOMAIN}
"

if [ ! -f "$CERT_PATH" ]; then
  certbot certonly --nginx \
    --non-interactive \
    --agree-tos \
    --email "$LETSENCRYPT_EMAIL" \
    --cert-name "$PRIMARY_DOMAIN" \
    $DOMAINS_ARGS
  exit 0
fi

if openssl x509 -in "$CERT_PATH" -noout -text | grep -F "DNS:${DEMO_DOMAIN}" >/dev/null 2>&1; then
  certbot renew --non-interactive
  exit 0
fi

certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email "$LETSENCRYPT_EMAIL" \
  --cert-name "$PRIMARY_DOMAIN" \
  --expand \
  $DOMAINS_ARGS
