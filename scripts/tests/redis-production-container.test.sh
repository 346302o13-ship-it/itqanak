#!/usr/bin/env bash
set -euo pipefail
umask 077

image_name="${1:-itqanak-redis-production-test}"
suffix="${GITHUB_RUN_ID:-local}-$PPID-$$"
container_name="itqanak-redis-valid-${suffix}"
empty_container_name="itqanak-redis-empty-${suffix}"
unreadable_container_name="itqanak-redis-unreadable-${suffix}"
volume_name="itqanak-redis-data-${suffix}"
test_directory="$(mktemp -d /tmp/itqanak-redis-production.XXXXXX)"

cleanup() {
  docker container rm --force \
    "$container_name" "$empty_container_name" "$unreadable_container_name" \
    >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  unlink "$test_directory/valid" 2>/dev/null || true
  unlink "$test_directory/empty" 2>/dev/null || true
  unlink "$test_directory/unreadable" 2>/dev/null || true
  rmdir -- "$test_directory" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

fail_test() {
  printf 'redis production container test failed: %s\n' "$1" >&2
  exit 1
}

chmod 0755 "$test_directory"
password="$(openssl rand -hex 32)"
printf '%s\n' "$password" >"$test_directory/valid"
: >"$test_directory/empty"
printf '%s\n' "$password" >"$test_directory/unreadable"
chmod 0444 "$test_directory/valid" "$test_directory/empty"
chmod 0000 "$test_directory/unreadable"

docker volume create "$volume_name" >/dev/null
docker run -d --name "$container_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --mount "type=volume,src=${volume_name},dst=/data" \
  --mount "type=bind,src=${test_directory}/valid,dst=/run/secrets/redis_password,readonly" \
  "$image_name" >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "$container_name" /usr/local/bin/itqanak-redis-healthcheck; then
    break
  fi
  [[ "$attempt" -lt 30 ]] || fail_test "authenticated health check did not become ready"
  sleep 1
done

unauthenticated_response="$(docker exec "$container_name" redis-cli --raw ping 2>/dev/null || true)"
[[ "$unauthenticated_response" != "PONG" ]] || fail_test "unauthenticated Redis access succeeded"
process_list="$(docker top "$container_name" -eo pid,user,args)"
[[ "$process_list" != *"$password"* ]] || fail_test "the Redis password appeared in argv"
[[ "$process_list" == *"redis-server"* ]] || fail_test "Redis server process was not running"
process_list=""
password=""
unset process_list password

if docker run --name "$empty_container_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --tmpfs /data:rw,noexec,nosuid,size=32m,uid=999,gid=1000,mode=0700 \
  --mount "type=bind,src=${test_directory}/empty,dst=/run/secrets/redis_password,readonly" \
  "$image_name" >/dev/null 2>&1; then
  fail_test "Redis accepted an empty password secret"
fi

if docker run --name "$unreadable_container_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --tmpfs /data:rw,noexec,nosuid,size=32m,uid=999,gid=1000,mode=0700 \
  --mount "type=bind,src=${test_directory}/unreadable,dst=/run/secrets/redis_password,readonly" \
  "$image_name" >/dev/null 2>&1; then
  fail_test "Redis accepted an unreadable password secret"
fi

printf 'redis production container tests passed\n'
