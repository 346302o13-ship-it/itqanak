#!/bin/sh
set -eu

secret_file="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
runtime_dir="/tmp/itqanak-redis"
acl_file="${runtime_dir}/users.acl"
config_file="${runtime_dir}/redis.conf"

if [ ! -r "$secret_file" ]; then
  echo "redis_startup_failed: password secret is not readable" >&2
  exit 1
fi

password="$(tr -d '\r\n' <"$secret_file")"
if [ -z "$password" ]; then
  echo "redis_startup_failed: password secret is empty" >&2
  exit 1
fi

password_hash="$(printf '%s' "$password" | sha256sum | awk '{print $1}')"
unset password

umask 077
mkdir -p "$runtime_dir"
chmod 0700 "$runtime_dir"
printf 'user default on #%s ~* &* +@all\n' "$password_hash" >"$acl_file"
unset password_hash
cat >"$config_file" <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
appendonly yes
save 60 1
aclfile ${acl_file}
loglevel warning
EOF
chmod 0600 "$acl_file" "$config_file"

exec redis-server "$config_file"
