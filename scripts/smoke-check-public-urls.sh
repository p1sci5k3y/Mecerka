#!/usr/bin/env sh
set -eu

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-mecerka.me}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.mecerka.me}"

curl -fsSIL --max-time 20 "https://${PRIMARY_DOMAIN}/" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/es" >/dev/null

prod_runtime="$(curl -fsS --max-time 20 "https://${PRIMARY_DOMAIN}/runtime-config")"
demo_runtime="$(curl -fsS --max-time 20 "https://${DEMO_DOMAIN}/runtime-config")"

printf '%s' "$prod_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null
printf '%s' "$demo_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null

curl -fsSIL --max-time 20 "https://${PRIMARY_DOMAIN}/es/privacy" >/dev/null
curl -fsSIL --max-time 20 "https://${PRIMARY_DOMAIN}/es/faq" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/es/privacy" >/dev/null
curl -fsSIL --max-time 20 "https://${DEMO_DOMAIN}/es/faq" >/dev/null
