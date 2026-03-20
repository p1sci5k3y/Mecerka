#!/usr/bin/env sh
set -eu

if command -v certbot >/dev/null 2>&1 && command -v dig >/dev/null 2>&1; then
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y certbot python3-certbot-nginx dnsutils
  exit 0
fi

if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y certbot python3-certbot-nginx bind-utils
  exit 0
fi

if command -v yum >/dev/null 2>&1; then
  sudo yum install -y certbot python3-certbot-nginx bind-utils
  exit 0
fi

echo "Unable to install certbot and dig automatically on this host" >&2
exit 1
