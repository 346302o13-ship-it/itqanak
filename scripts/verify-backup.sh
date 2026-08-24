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
  log "backup_verification_failed: $1"
  exit 1
}

verify_database_name="${VERIFY_DATABASE_NAME:-}"
unset VERIFY_DATABASE_NAME
[[ "$verify_database_name" =~ ^itqanak_restore_[a-z0-9_]+$ ]] \
  || fail "VERIFY_DATABASE_NAME must identify a dedicated restore database"

unset database_url
database_url=""
if ! itqanak_take_secret DATABASE_URL database_url; then
  itqanak_forget_database_url_inputs
  fail "$ITQANAK_LIBPQ_ERROR"
fi
itqanak_forget_database_url_inputs
if ! itqanak_create_libpq_service \
  "$database_url" "itqanak_verify" "$verify_database_name"; then
  database_url=""
  fail "$ITQANAK_LIBPQ_ERROR"
fi
database_url=""
unset database_url

cleanup() {
  itqanak_destroy_libpq_service
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

backup_path="${1:-}"
[[ -n "$backup_path" && -f "$backup_path" ]] || fail "pass a readable custom backup path"

if [[ -f "${backup_path}.metadata.json" ]]; then
  expected_checksum="$(awk -F '"' '/"sha256"/ { print $4 }' "${backup_path}.metadata.json")"
  actual_checksum="$(sha256sum "$backup_path" | awk '{print $1}')"
  [[ -z "$expected_checksum" || "$expected_checksum" == "$actual_checksum" ]] || fail "backup checksum does not match metadata"
fi

ITQANAK_RESTORE_USE_EXISTING_SERVICE=1 PGSERVICEFILE="$ITQANAK_LIBPQ_SERVICE_FILE" PGSERVICE="$ITQANAK_LIBPQ_SERVICE_NAME" \
  "${script_dir}/restore-postgres.sh" --confirm-restore "$backup_path"
schema_count="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command 'SELECT count(*) FROM schema_migrations')"
[[ "$schema_count" =~ ^[1-9][0-9]*$ ]] || fail "restored database does not contain applied migrations"
psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command "SELECT 1 FROM platform_metadata WHERE key = 'platform_foundation'" | grep -qx '1' \
  || fail "restored database does not contain the foundation metadata"

phase3_migration_count="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command "
  SELECT count(*)
  FROM schema_migrations
  WHERE filename IN (
    '003_service_catalog.sql',
    '004_service_requests.sql',
    '005_request_attachments.sql'
  )
")"
[[ "$phase3_migration_count" =~ ^[0-3]$ ]] || fail "could not determine the Phase 3 migration state"

if [[ "$phase3_migration_count" == "0" ]]; then
  log "backup_verified migration_count=${schema_count} phase3_schema=not_applied"
  exit 0
fi

[[ "$phase3_migration_count" == "3" ]] || fail "restored database contains an incomplete Phase 3 migration set"

phase3_table_count="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command "
  SELECT count(*)
  FROM (
    VALUES
      ('service_categories'),
      ('services'),
      ('service_requests'),
      ('service_request_events'),
      ('service_request_attachments')
  ) AS expected(table_name)
  WHERE to_regclass('public.' || table_name) IS NOT NULL
")"
[[ "$phase3_table_count" == "5" ]] || fail "restored Phase 3 database is missing one or more required tables"

phase3_counts="$(psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --tuples-only --no-align --command "
  SELECT concat_ws(
    '|',
    (SELECT count(*) FROM service_categories),
    (SELECT count(*) FROM services),
    (SELECT count(*) FROM service_requests),
    (SELECT count(*) FROM service_request_events),
    (SELECT count(*) FROM service_request_attachments)
  )
")"
IFS='|' read -r category_count service_count request_count event_count attachment_count <<<"$phase3_counts"
for count in "$category_count" "$service_count" "$request_count" "$event_count" "$attachment_count"; do
  [[ "$count" =~ ^[0-9]+$ ]] || fail "restored Phase 3 table counts could not be verified"
done
[[ "$category_count" =~ ^[1-9][0-9]*$ ]] || fail "restored Phase 3 catalog has no service categories"
[[ "$service_count" =~ ^[1-9][0-9]*$ ]] || fail "restored Phase 3 catalog has no services"

log "backup_verified migration_count=${schema_count} phase3_schema=verified service_categories=${category_count} services=${service_count} service_requests=${request_count} service_request_events=${event_count} service_request_attachments=${attachment_count}"
