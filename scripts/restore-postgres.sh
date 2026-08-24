#!/usr/bin/env bash
set -euo pipefail
umask 077

script_path="${BASH_SOURCE[0]}"
script_dir="${script_path%/*}"
[[ "$script_dir" != "$script_path" ]] || script_dir="."
# shellcheck source=libpq-service.sh
source "${script_dir}/libpq-service.sh"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "restore_failed: $1"
  exit 1
}

cleanup() {
  itqanak_destroy_libpq_service
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "${ITQANAK_RESTORE_USE_EXISTING_SERVICE:-}" == "1" ]]; then
  existing_service_file="${PGSERVICEFILE:-}"
  existing_service_name="${PGSERVICE:-}"
  unset ITQANAK_RESTORE_USE_EXISTING_SERVICE
  itqanak_forget_database_url_inputs
  if ! itqanak_use_existing_libpq_service "$existing_service_file" "$existing_service_name"; then
    fail "$ITQANAK_LIBPQ_ERROR"
  fi
else
  unset target_url
  target_url=""
  if ! itqanak_take_secret RESTORE_DATABASE_URL target_url; then
    itqanak_forget_database_url_inputs
    fail "$ITQANAK_LIBPQ_ERROR"
  fi
  itqanak_forget_database_url_inputs
  if ! itqanak_create_libpq_service "$target_url" "itqanak_restore"; then
    target_url=""
    fail "$ITQANAK_LIBPQ_ERROR"
  fi
  target_url=""
  unset target_url
fi

[[ "${1:-}" == "--confirm-restore" ]] || fail "pass --confirm-restore to restore into a prepared temporary database"
backup_path="${2:-}"
[[ -n "$backup_path" && -f "$backup_path" ]] || fail "a readable custom backup path is required"

target_name="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command 'SELECT current_database()')"
[[ "$target_name" =~ ^itqanak_restore_[a-z0-9_]+$ ]] || fail "target database must be a dedicated itqanak_restore_* database"

if ! pg_restore --list "$backup_path" >/dev/null; then
  fail "backup is not a readable PostgreSQL custom-format archive"
fi
# A missing schema_migrations table is not enough: an unrelated table,
# function, type, extension, or custom schema could still make a restore
# partial. PostgreSQL records every ordinary object in public as a normal
# dependency on that schema; custom schemas are rejected separately.
existing_object_count="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command "
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
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$ITQANAK_LIBPQ_DSN" "$backup_path"
log "restore_completed target=${target_name}"
