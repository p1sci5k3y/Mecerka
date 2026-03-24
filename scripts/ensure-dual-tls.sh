#!/usr/bin/env sh
set -eu

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-mecerka.me}"
WWW_DOMAIN="${WWW_DOMAIN:-www.mecerka.me}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.mecerka.me}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
PRIMARY_CERT_NAME="${PRIMARY_CERT_NAME:-${PRIMARY_DOMAIN}}"
DEMO_CERT_NAME="${DEMO_CERT_NAME:-${DEMO_DOMAIN}}"
PRIMARY_CERT_PATH="/etc/letsencrypt/live/${PRIMARY_CERT_NAME}/fullchain.pem"
DEMO_CERT_PATH="/etc/letsencrypt/live/${DEMO_CERT_NAME}/fullchain.pem"

if [ -z "$LETSENCRYPT_EMAIL" ]; then
  echo "LETSENCRYPT_EMAIL is required to manage TLS certificates" >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1 || ! command -v dig >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1; then
  echo "certbot, dig and nginx must be installed before running ensure-dual-tls.sh" >&2
  exit 1
fi

resolve_ipv4() {
  domain="$1"
  dig +short "$domain" @1.1.1.1 | awk '/^[0-9.]+$/ { print; exit }'
}

assert_same_ipv4() {
  domain="$1"
  expected_ip="$2"
  domain_ip="$(resolve_ipv4 "$domain")"

  if [ -z "$domain_ip" ]; then
    echo "Public DNS check failed: ${domain} does not resolve to an IPv4 address" >&2
    exit 1
  fi

  if [ "$domain_ip" != "$expected_ip" ]; then
    echo "Public DNS check failed: ${domain} resolves to ${domain_ip}, but ${PRIMARY_DOMAIN} resolves to ${expected_ip}. Both must point to the same host for the dual deploy." >&2
    exit 1
  fi
}

certificate_contains_domain() {
  cert_path="$1"
  domain="$2"
  sudo openssl x509 -in "$cert_path" -noout -text | grep -F "DNS:${domain}" >/dev/null 2>&1
}

ensure_certificate() {
  cert_name="$1"
  cert_path="$2"
  shift 2

  domain_args=""
  requires_expand="0"

  for domain in "$@"; do
    domain_args="${domain_args} -d ${domain}"
    if [ -f "$cert_path" ] && ! certificate_contains_domain "$cert_path" "$domain"; then
      requires_expand="1"
    fi
  done

  if [ ! -f "$cert_path" ]; then
    sudo certbot certonly --standalone \
      --non-interactive \
      --agree-tos \
      --email "$LETSENCRYPT_EMAIL" \
      --cert-name "$cert_name" \
      $domain_args
    return
  fi

  if [ "$requires_expand" = "1" ]; then
    sudo certbot certonly --standalone \
      --non-interactive \
      --agree-tos \
      --email "$LETSENCRYPT_EMAIL" \
      --cert-name "$cert_name" \
      --expand \
      $domain_args
    return
  fi

  sudo certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "$LETSENCRYPT_EMAIL" \
    --keep-until-expiring \
    --cert-name "$cert_name" \
    $domain_args
}

PRIMARY_IP="$(resolve_ipv4 "$PRIMARY_DOMAIN")"

if [ -z "$PRIMARY_IP" ]; then
  echo "Public DNS check failed: ${PRIMARY_DOMAIN} does not resolve to an IPv4 address" >&2
  exit 1
fi

assert_same_ipv4 "$WWW_DOMAIN" "$PRIMARY_IP"
assert_same_ipv4 "$DEMO_DOMAIN" "$PRIMARY_IP"

sudo systemctl stop nginx
trap 'sudo systemctl start nginx >/dev/null 2>&1 || true' EXIT HUP INT TERM

ensure_certificate "$PRIMARY_CERT_NAME" "$PRIMARY_CERT_PATH" "$PRIMARY_DOMAIN" "$WWW_DOMAIN"
ensure_certificate "$DEMO_CERT_NAME" "$DEMO_CERT_PATH" "$DEMO_DOMAIN"
