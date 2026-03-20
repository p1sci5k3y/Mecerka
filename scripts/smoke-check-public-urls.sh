#!/usr/bin/env sh
set -eu

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-mecerka.me}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.mecerka.me}"

curl -fsSIL --max-time 20 "https://${PRIMARY_DOMAIN}/" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/es" >/dev/null
