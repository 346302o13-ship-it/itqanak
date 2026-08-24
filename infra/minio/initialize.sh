#!/bin/sh
set -eu

read_secret() {
  secret_path="$1"
  IFS= read -r secret_value <"$secret_path" || true
  if [ -z "$secret_value" ]; then
    echo "minio_init_failed: empty secret" >&2
    exit 1
  fi
  printf '%s' "$secret_value"
}

root_user="$(read_secret /run/secrets/storage_s3_root_access_key_id)"
root_password="$(read_secret /run/secrets/storage_s3_root_secret_access_key)"
app_user="$(read_secret /run/secrets/storage_s3_access_key_id)"
app_password="$(read_secret /run/secrets/storage_s3_secret_access_key)"

mc alias set local http://minio:9000 "$root_user" "$root_password" >/dev/null
mc mb --ignore-existing "local/${MINIO_BUCKET}" >/dev/null
mc anonymous set none "local/${MINIO_BUCKET}" >/dev/null
policy_path="/tmp/itqanak-app-policy.json"
cat >"$policy_path" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${MINIO_BUCKET}/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${MINIO_BUCKET}"]
    }
  ]
}
EOF
mc admin policy create local itqanak-app "$policy_path" >/dev/null
mc admin user add local "$app_user" "$app_password" >/dev/null 2>&1 || \
  mc admin user enable local "$app_user" >/dev/null
mc admin policy attach local itqanak-app --user "$app_user" >/dev/null
rm -f "$policy_path"
echo "minio_bucket_ready bucket=${MINIO_BUCKET}"
