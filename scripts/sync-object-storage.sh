#!/usr/bin/env bash
# Replicate the private attachment bucket to an off-host, cross-account target.
# A PostgreSQL dump never contains attachment bytes, so database recovery alone
# loses every uploaded file. Run on a timer alongside the database backup.
#
# Configuration (all from the environment; no rclone config file is read):
#   SOURCE remote  -> RCLONE_CONFIG_MINIO_*   describing the in-host MinIO
#   TARGET remote  -> RCLONE_CONFIG_OFFHOST_* describing the distinct provider
#   OBJECT_SYNC_SOURCE   e.g. "minio:itqanak-private"
#   OBJECT_SYNC_TARGET   e.g. "offhost:itqanak-attachments"
#   OBJECT_SYNC_REQUIRE  "true" (default) fails when the target is unset
set -euo pipefail
umask 077

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fail() { log "object_sync_failed: $1"; exit 1; }

source_remote="${OBJECT_SYNC_SOURCE:-}"
target_remote="${OBJECT_SYNC_TARGET:-}"

if [[ -z "$target_remote" ]]; then
  if [[ "${OBJECT_SYNC_REQUIRE:-true}" == "true" ]]; then
    fail "OBJECT_SYNC_TARGET is unset; refusing to leave attachments un-replicated"
  fi
  log "object_sync_skipped: no target configured"
  exit 0
fi

[[ -n "$source_remote" ]] || fail "OBJECT_SYNC_SOURCE is unset"
command -v rclone >/dev/null 2>&1 || fail "rclone is not installed"

log "object_sync_started source=${source_remote} target=${target_remote}"
# --immutable: existing objects are opaque keys that never change in place, so a
# changed size/hash means corruption, not an update. Keep deletes off the mirror
# (retain on the target even after a source lifecycle deletes an orphan).
rclone sync --config /dev/null --cache-dir /tmp --immutable --create-empty-src-dirs=false \
  "$source_remote" "$target_remote" \
  || fail "rclone sync returned non-zero"
log "object_sync_completed"
