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
    echo "[smoke] attempt ${i}/${attempts} failed: $*" >&2
    if [ "$i" -eq "$attempts" ]; then
      break
    fi
    sleep "$delay"
    i=$((i + 1))
  done

  return 1
}

curl_head_ok() {
  curl -fsSIL --http1.1 --retry 2 --retry-delay 1 --retry-all-errors --max-time 20 "$1" >/dev/null
}

curl_body() {
  curl -fsS --http1.1 --retry 2 --retry-delay 1 --retry-all-errors --max-time 20 "$1"
}

check_head() {
  label="$1"
  url="$2"
  echo "[smoke] checking ${label}: ${url}" >&2
  retry 12 5 curl_head_ok "$url"
}

check_body() {
  label="$1"
  url="$2"
  echo "[smoke] checking ${label}: ${url}" >&2
  retry 12 5 curl_body "$url"
}

check_head "prod-home" "https://${PRIMARY_DOMAIN}/"
check_head "demo-home" "https://${DEMO_DOMAIN}/"
check_head "demo-home-es" "https://${DEMO_DOMAIN}/es"

prod_runtime="$(check_body "prod-runtime-config" "https://${PRIMARY_DOMAIN}/runtime-config")"
demo_runtime="$(check_body "demo-runtime-config" "https://${DEMO_DOMAIN}/runtime-config")"

printf '%s' "$prod_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null
printf '%s' "$demo_runtime" | grep '"apiBaseUrl":"\/api"' >/dev/null

check_head "prod-privacy" "https://${PRIMARY_DOMAIN}/es/privacy"
check_head "prod-faq" "https://${PRIMARY_DOMAIN}/es/faq"
check_head "demo-privacy" "https://${DEMO_DOMAIN}/es/privacy"
check_head "demo-faq" "https://${DEMO_DOMAIN}/es/faq"
