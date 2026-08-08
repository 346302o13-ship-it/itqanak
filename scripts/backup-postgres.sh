#!/usr/bin/env bash
set -euo pipefail
umask 077

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "backup_failed: $1"
  exit 1
}

read_secret_value() {
  local direct_name="$1"
  local file_name="${direct_name}_FILE"
  local file_path="${!file_name:-}"
  if [[ -n "$file_path" ]]; then
    [[ -r "$file_path" ]] || fail "required secret file is not readable"
    local secret_value
    secret_value="$(tr -d '\r\n' <"$file_path")"
    [[ -n "$secret_value" ]] || fail "database configuration is required"
    printf '%s' "$secret_value"
    return
  fi
  [[ -n "${!direct_name:-}" ]] || fail "database configuration is required"
  printf '%s' "${!direct_name}"
}

backup_dir="${BACKUP_DIR:-$PWD/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
[[ "$retention_days" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS must be a non-negative integer"
mkdir -p -m 700 "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
[[ "$backup_dir" != "/" ]] || fail "BACKUP_DIR must not be the filesystem root"

database_url="$(read_secret_value DATABASE_URL)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="itqanak-postgres-${timestamp}.dump"
backup_path="${backup_dir}/${backup_name}"
temporary_path="$(mktemp "${backup_dir}/.itqanak-backup.XXXXXX")"
[[ ! -e "$backup_path" ]] || fail "refusing to overwrite an existing backup"

cleanup() {
  if [[ -f "$temporary_path" ]]; then
    : >"$temporary_path"
    rm -f -- "$temporary_path"
  fi
}
trap cleanup EXIT INT TERM

log "backup_started"
if ! pg_dump --format=custom --no-owner --no-privileges --file="$temporary_path" "$database_url"; then
  fail "pg_dump did not complete"
fi
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
