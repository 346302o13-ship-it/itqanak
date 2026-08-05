#!/usr/bin/env bash
set -euo pipefail
umask 077

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "backup_verification_failed: $1"
  exit 1
}

backup_path="${1:-}"
[[ -n "$backup_path" && -f "$backup_path" ]] || fail "pass a readable custom backup path"
[[ -n "${VERIFY_DATABASE_URL:-}${VERIFY_DATABASE_URL_FILE:-}" ]] || fail "VERIFY_DATABASE_URL or VERIFY_DATABASE_URL_FILE is required"

if [[ -n "${VERIFY_DATABASE_URL_FILE:-}" ]]; then
  [[ -r "$VERIFY_DATABASE_URL_FILE" ]] || fail "verification secret file is not readable"
  verify_url="$(tr -d '\r\n' <"$VERIFY_DATABASE_URL_FILE")"
else
  verify_url="$VERIFY_DATABASE_URL"
fi

if [[ -f "${backup_path}.metadata.json" ]]; then
  expected_checksum="$(awk -F '"' '/"sha256"/ { print $4 }' "${backup_path}.metadata.json")"
  actual_checksum="$(sha256sum "$backup_path" | awk '{print $1}')"
  [[ -z "$expected_checksum" || "$expected_checksum" == "$actual_checksum" ]] || fail "backup checksum does not match metadata"
fi

RESTORE_DATABASE_URL="$verify_url" "$(dirname "$0")/restore-postgres.sh" --confirm-restore "$backup_path"
schema_count="$(psql "$verify_url" --no-psqlrc --tuples-only --no-align --command 'SELECT count(*) FROM schema_migrations')"
[[ "$schema_count" =~ ^[1-9][0-9]*$ ]] || fail "restored database does not contain applied migrations"
psql "$verify_url" --no-psqlrc --tuples-only --no-align --command "SELECT 1 FROM platform_metadata WHERE key = 'platform_foundation'" | grep -qx '1' \
  || fail "restored database does not contain the foundation metadata"
log "backup_verified migration_count=${schema_count}"
