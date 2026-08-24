#!/usr/bin/env bash
set -euo pipefail
umask 077

script_path="${BASH_SOURCE[0]}"
test_dir="${script_path%/*}"
[[ "$test_dir" != "$script_path" ]] || test_dir="."
scripts_dir="${test_dir%/*}"
# shellcheck source=../libpq-service.sh
source "${scripts_dir}/libpq-service.sh"

unset integration_url
integration_url=""
if [[ -n "${LIBPQ_TEST_DATABASE_URL:-}${LIBPQ_TEST_DATABASE_URL_FILE:-}" ]]; then
  itqanak_take_secret LIBPQ_TEST_DATABASE_URL integration_url || {
    printf 'libpq-service test failed: %s\n' "$ITQANAK_LIBPQ_ERROR" >&2
    exit 1
  }
fi
secret_marker="${LIBPQ_TEST_SECRET_MARKER:-}"
unset LIBPQ_TEST_DATABASE_URL LIBPQ_TEST_DATABASE_URL_FILE LIBPQ_TEST_SECRET_MARKER
itqanak_forget_database_url_inputs

fail_test() {
  printf 'libpq-service test failed: %s\n' "$1" >&2
  exit 1
}

assert_not_in_proc_file() {
  local proc_file="$1"
  local forbidden="$2"
  local field

  while IFS= read -r -d '' field; do
    [[ "$field" != *"$forbidden"* ]] || fail_test "database URI material reached a client process"
  done <"$proc_file"
}

assert_env_name_absent() {
  local proc_file="$1"
  local forbidden_name="$2"
  local field

  while IFS= read -r -d '' field; do
    [[ "$field" != "${forbidden_name}="* ]] || fail_test "a database URL/libpq variable reached a client environment"
  done <"$proc_file"
}

cleanup() {
  itqanak_destroy_libpq_service
}
trap cleanup EXIT

unset unit_uri captured_uri
unit_uri='postgresql://service%5Fuser:p%40ss%3Dwo%5Crd%27%23%5B%5D@db.example:5433/catalog%5Fdb?application_name=backup%20probe&sslmode=require'
export DATABASE_URL="$unit_uri"
captured_uri=""
itqanak_take_secret DATABASE_URL captured_uri || fail_test "$ITQANAK_LIBPQ_ERROR"
[[ ! -v DATABASE_URL ]] || fail_test "direct database URL remained exported"
itqanak_forget_database_url_inputs
itqanak_create_libpq_service "$captured_uri" "unit_probe" || fail_test "$ITQANAK_LIBPQ_ERROR"
captured_uri=""
unset captured_uri unit_uri

service_file="$ITQANAK_LIBPQ_SERVICE_FILE"
service_directory="$ITQANAK_LIBPQ_SERVICE_DIRECTORY"
[[ "$(stat -c '%a' "$service_file")" == "600" ]] || fail_test "service file mode is not 0600"
[[ "$(stat -c '%a' "$service_directory")" == "700" ]] || fail_test "service directory mode is not 0700"
service_contents="$(<"$service_file")"
expected_password_line=$'password=p@ss=wo\\rd\'#[]\n'
[[ "$service_contents" == *$'user=service_user\n'* ]] || fail_test "percent-decoded user is missing"
[[ "$service_contents" == *"$expected_password_line"* ]] || fail_test "percent-decoded password is missing"
[[ "$service_contents" == *$'dbname=catalog_db\n'* ]] || fail_test "percent-decoded database name is missing"
[[ "$service_contents" == *$'application_name=backup probe\n'* ]] || fail_test "query option is missing"
service_contents=""
expected_password_line=""
unset service_contents expected_password_line
(
  itqanak_use_existing_libpq_service "$ITQANAK_LIBPQ_SERVICE_FILE" "$ITQANAK_LIBPQ_SERVICE_NAME" \
    || fail_test "$ITQANAK_LIBPQ_ERROR"
  [[ "$ITQANAK_LIBPQ_DSN" == "service=unit_probe" ]] || fail_test "existing service handoff failed"
)

itqanak_destroy_libpq_service
[[ ! -e "$service_file" && ! -e "$service_directory" ]] || fail_test "private service artifacts were not removed"

itqanak_create_libpq_service \
  'postgresql://probe@db.example/catalog' \
  "restore_override_probe" \
  "itqanak_restore_verification" \
  || fail_test "$ITQANAK_LIBPQ_ERROR"
service_contents="$(<"$ITQANAK_LIBPQ_SERVICE_FILE")"
[[ "$service_contents" == *$'dbname=itqanak_restore_verification\n'* ]] \
  || fail_test "restore database override was not serialized"
itqanak_destroy_libpq_service

if itqanak_create_libpq_service \
  'postgresql://probe@db.example/catalog' "invalid_restore_probe" "itqanak"; then
  fail_test "unsafe restore database override was accepted"
fi

itqanak_create_libpq_service 'postgresql://probe@[2001:db8::1]:5432,db.example:5433/catalog' "multi_host_probe" \
  || fail_test "$ITQANAK_LIBPQ_ERROR"
service_contents="$(<"$ITQANAK_LIBPQ_SERVICE_FILE")"
[[ "$service_contents" == *$'host=2001:db8::1,db.example\n'* ]] || fail_test "multi-host URI was not serialized"
[[ "$service_contents" == *'port=5432,5433'* ]] || fail_test "multi-host ports were not serialized"
service_contents=""
unset service_contents
itqanak_destroy_libpq_service

if itqanak_create_libpq_service 'postgresql://user:bad%0Avalue@db.example/catalog' "invalid_probe"; then
  fail_test "line-breaking connection value was accepted"
fi
[[ -z "$ITQANAK_LIBPQ_SERVICE_FILE" ]] || fail_test "failed parse left a service file registered"

if itqanak_create_libpq_service 'postgresql://user:%20leading-space@db.example/catalog' "whitespace_probe"; then
  fail_test "boundary whitespace in a connection value was accepted"
fi
[[ -z "$ITQANAK_LIBPQ_SERVICE_FILE" ]] || fail_test "failed whitespace parse left a service file registered"

unset database_uri local_export_marker
export database_uri="export-attribute-placeholder"
local_export_marker="local_export_probe_4ec7"
assert_create_child_environment() {
  local environment_entry

  while IFS= read -r environment_entry; do
    [[ "$environment_entry" != *"$local_export_marker"* ]] \
      || fail_test "a Bash local inherited export and leaked the URI"
  done < <(env)
}
mktemp() {
  assert_create_child_environment
  command mktemp "$@"
}
chmod() {
  assert_create_child_environment
  command chmod "$@"
}
itqanak_create_libpq_service "postgresql://probe:${local_export_marker}@db.example/catalog" "export_probe" \
  || fail_test "$ITQANAK_LIBPQ_ERROR"
itqanak_destroy_libpq_service
unset -f mktemp chmod assert_create_child_environment
unset database_uri local_export_marker

if [[ "${1:-}" == "--integration" ]]; then
  [[ -n "$integration_url" ]] || fail_test "LIBPQ_TEST_DATABASE_URL is required for integration mode"
  [[ -n "$secret_marker" ]] || fail_test "LIBPQ_TEST_SECRET_MARKER is required for integration mode"

  itqanak_create_libpq_service "$integration_url" "integration_probe" || fail_test "$ITQANAK_LIBPQ_ERROR"
  integration_url=""
  unset integration_url

  psql --dbname="$ITQANAK_LIBPQ_DSN" --no-psqlrc --quiet --command 'SELECT pg_sleep(4)' >/dev/null &
  client_pid=$!
  sleep 1
  kill -0 "$client_pid" 2>/dev/null || fail_test "psql exited before process inspection"
  assert_not_in_proc_file "/proc/${client_pid}/cmdline" "$secret_marker"
  assert_not_in_proc_file "/proc/${client_pid}/environ" "$secret_marker"
  for forbidden_name in DATABASE_URL DATABASE_URL_FILE RESTORE_DATABASE_URL RESTORE_DATABASE_URL_FILE VERIFY_DATABASE_URL VERIFY_DATABASE_URL_FILE PGPASSWORD PGDATABASE PGHOST PGUSER; do
    assert_env_name_absent "/proc/${client_pid}/environ" "$forbidden_name"
  done
  wait "$client_pid"
fi

printf 'libpq-service tests passed\n'
