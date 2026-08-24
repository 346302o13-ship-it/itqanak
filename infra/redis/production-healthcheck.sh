#!/bin/sh
set -eu

secret_file="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
if [ ! -r "$secret_file" ]; then
  exit 1
fi

password="$(tr -d '\r\n' <"$secret_file")"
if [ -z "$password" ]; then
  exit 1
fi

response="$(REDISCLI_AUTH="$password" redis-cli --no-auth-warning --raw ping 2>/dev/null)" || exit 1
unset password
[ "$response" = "PONG" ]
