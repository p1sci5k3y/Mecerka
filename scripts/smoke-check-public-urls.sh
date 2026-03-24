#!/usr/bin/env sh
set -eu

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-mecerka.me}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.mecerka.me}"

retry() {
  attempts="$1"
  delay="$2"
  shift 2

  i=1
  while [ "$i" -le "$attempts" ]; do
    if "$@"; then
      return 0
    fi
    if [ "$i" -eq "$attempts" ]; then
      break
    fi
    sleep "$delay"
    i=$((i + 1))
  done

  return 1
}

curl_head_ok() {
  curl -fsSIL --max-time 20 "$1" >/dev/null
}

curl_body() {
  curl -fsS --max-time 20 "$1"
}

retry 8 5 curl_head_ok "https://${PRIMARY_DOMAIN}/"
retry 8 5 curl_head_ok "https://${DEMO_DOMAIN}/"
retry 8 5 curl_head_ok "https://${DEMO_DOMAIN}/es"

prod_runtime="$(retry 8 5 curl_body "https://${PRIMARY_DOMAIN}/runtime-config")"
demo_runtime="$(retry 8 5 curl_body "https://${DEMO_DOMAIN}/runtime-config")"

printf '%s' "$prod_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null
printf '%s' "$demo_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null

retry 8 5 curl_head_ok "https://${PRIMARY_DOMAIN}/es/privacy"
retry 8 5 curl_head_ok "https://${PRIMARY_DOMAIN}/es/faq"
retry 8 5 curl_head_ok "https://${DEMO_DOMAIN}/es/privacy"
retry 8 5 curl_head_ok "https://${DEMO_DOMAIN}/es/faq"
