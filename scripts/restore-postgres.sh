#!/usr/bin/env bash
set -euo pipefail
umask 077

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "restore_failed: $1"
  exit 1
}

read_target_url() {
  local file_path="${RESTORE_DATABASE_URL_FILE:-}"
  if [[ -n "$file_path" ]]; then
    [[ -r "$file_path" ]] || fail "restore secret file is not readable"
    tr -d '\r\n' <"$file_path"
    return
  fi
  [[ -n "${RESTORE_DATABASE_URL:-}" ]] || fail "RESTORE_DATABASE_URL or RESTORE_DATABASE_URL_FILE is required"
  printf '%s' "$RESTORE_DATABASE_URL"
}

[[ "${1:-}" == "--confirm-restore" ]] || fail "pass --confirm-restore to restore into a prepared temporary database"
backup_path="${2:-}"
[[ -n "$backup_path" && -f "$backup_path" ]] || fail "a readable custom backup path is required"

target_url="$(read_target_url)"
target_name="$(psql "$target_url" --no-psqlrc --tuples-only --no-align --command 'SELECT current_database()')"
[[ "$target_name" =~ ^itqanak_restore_[a-z0-9_]+$ ]] || fail "target database must be a dedicated itqanak_restore_* database"

if ! pg_restore --list "$backup_path" >/dev/null; then
  fail "backup is not a readable PostgreSQL custom-format archive"
fi
# A missing schema_migrations table is not enough: an unrelated table,
# function, type, extension, or custom schema could still make a restore
# partial. PostgreSQL records every ordinary object in public as a normal
# dependency on that schema; custom schemas are rejected separately.
existing_object_count="$(psql "$target_url" --no-psqlrc --tuples-only --no-align --command "
  SELECT
    (
      SELECT count(*)
      FROM pg_depend AS dependency
      JOIN pg_namespace AS namespace
        ON dependency.refclassid = 'pg_namespace'::regclass
       AND dependency.refobjid = namespace.oid
      WHERE namespace.nspname = 'public'
        AND dependency.deptype = 'n'
    )
    +
    (
      SELECT count(*)
      FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public')
        AND nspname NOT LIKE 'pg_%'
    )
")"
[[ "$existing_object_count" =~ ^0$ ]] || fail "target database is not empty; this script never drops existing objects"

log "restore_started target=${target_name}"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_url" "$backup_path"
log "restore_completed target=${target_name}"
