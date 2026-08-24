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
  log "backup_failed: $1"
  exit 1
}

unset database_url
database_url=""
if ! itqanak_take_secret DATABASE_URL database_url; then
  itqanak_forget_database_url_inputs
  fail "$ITQANAK_LIBPQ_ERROR"
fi
itqanak_forget_database_url_inputs
if ! itqanak_create_libpq_service "$database_url" "itqanak_backup"; then
  database_url=""
  fail "$ITQANAK_LIBPQ_ERROR"
fi
database_url=""
unset database_url

temporary_path=""

cleanup() {
  if [[ -n "$temporary_path" && -f "$temporary_path" ]]; then
    : >"$temporary_path"
    rm -f -- "$temporary_path"
  fi
  itqanak_destroy_libpq_service
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

backup_dir="${BACKUP_DIR:-$PWD/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
[[ "$retention_days" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS must be a non-negative integer"
mkdir -p -m 700 "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
[[ "$backup_dir" != "/" ]] || fail "BACKUP_DIR must not be the filesystem root"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="itqanak-postgres-${timestamp}.dump"
backup_path="${backup_dir}/${backup_name}"
temporary_path="$(mktemp "${backup_dir}/.itqanak-backup.XXXXXX")"
[[ ! -e "$backup_path" ]] || fail "refusing to overwrite an existing backup"

log "backup_started"
if ! pg_dump --format=custom --no-owner --no-privileges --file="$temporary_path" --dbname="$ITQANAK_LIBPQ_DSN"; then
  fail "pg_dump did not complete"
fi
itqanak_destroy_libpq_service
if ! pg_restore --list "$temporary_path" >/dev/null; then
  fail "pg_restore could not validate the custom backup"
fi

chmod 600 "$temporary_path"
mv -f "$temporary_path" "$backup_path"
checksum="$(sha256sum "$backup_path" | awk '{print $1}')"
metadata_path="${backup_path}.metadata.json"
printf '{\n  "format": "postgres-custom",\n  "createdAt": "%s",\n  "file": "%s",\n  "sha256": "%s"\n}\n' \
  "$timestamp" "$backup_name" "$checksum" >"$metadata_path"
chmod 600 "$backup_path" "$metadata_path"

# Retention is intentionally limited to this validated directory and only to
# backups named by this script. Off-server replication is still required.
find "$backup_dir" -maxdepth 1 -type f -name 'itqanak-postgres-*.dump' -mtime "+${retention_days}" -delete
find "$backup_dir" -maxdepth 1 -type f -name 'itqanak-postgres-*.dump.metadata.json' -mtime "+${retention_days}" -delete

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null 2>&1 || fail "AWS CLI is required when BACKUP_S3_URI is set"
  aws s3 cp "$backup_path" "${BACKUP_S3_URI%/}/$backup_name" --only-show-errors
  aws s3 cp "$metadata_path" "${BACKUP_S3_URI%/}/${backup_name}.metadata.json" --only-show-errors
fi

trap - EXIT INT TERM
log "backup_completed file=${backup_name} sha256=${checksum}"
