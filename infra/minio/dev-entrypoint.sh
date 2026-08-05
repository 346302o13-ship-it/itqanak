#!/bin/sh
set -eu

# MinIO has insecure historical defaults when credentials are omitted. Keep the
# development profile explicit without committing a password to Compose or Git.
: "${MINIO_ROOT_USER:?Set MINIO_ROOT_USER before enabling the storage profile}"
: "${MINIO_ROOT_PASSWORD:?Set MINIO_ROOT_PASSWORD before enabling the storage profile}"

exec minio "$@"
