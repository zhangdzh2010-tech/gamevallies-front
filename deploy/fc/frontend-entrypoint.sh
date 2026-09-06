#!/bin/sh
set -eu
: "${GAMEVALLIES_FC_INTERNAL_TOKEN:?Missing internal token}" "${API_UPSTREAM:?Missing API upstream}"
case "$GAMEVALLIES_FC_INTERNAL_TOKEN" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#GAMEVALLIES_FC_INTERNAL_TOKEN}" -eq 64 ] || exit 2
printf '%s\n' "$API_UPSTREAM" | grep -Eq '^https://[a-zA-Z0-9.-]+$' || exit 2
export FC_DNS_RESOLVER=$(awk '/^nameserver / { print $2; exit }' /etc/resolv.conf)
/code/envsubst '${GAMEVALLIES_FC_INTERNAL_TOKEN} ${API_UPSTREAM} ${FC_DNS_RESOLVER}' < /code/frontend.template > /tmp/nginx/server.conf
