#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "${BASH_SOURCE[0]%/*}/../.." && pwd -P)"
temporary_directory="$(mktemp -d)"
cleanup() {
  rm -rf -- "$temporary_directory"
}
trap cleanup EXIT

export PATH="${repository_root}/scripts/tests/fixtures:$PATH"
export FAKE_DOCKER_LOG="${temporary_directory}/docker.log"
export FAKE_DOCKER_RUNNING_FILE="${temporary_directory}/running"
export ITQANAK_COMPOSE_FILE="${repository_root}/compose.production.yaml"
export ITQANAK_COMPOSE_ENV_FILE="${temporary_directory}/production.env"
export ITQANAK_COMPOSE_PROJECT_NAME="itqanak-test"
export CLAMAV_RECONCILE_TIMEOUT_SECONDS=30
export CLAMAV_RECONCILE_POLL_SECONDS=1
: >"$ITQANAK_COMPOSE_ENV_FILE"

fail_test() {
  printf '%s\n' "reconcile-clamav test failed: $1" >&2
  exit 1
}

assert_log_contains() {
  rg --fixed-strings --quiet -- "$1" "$FAKE_DOCKER_LOG" || fail_test "missing log fragment: $1"
}

printf '%s\n' "yes" >"$FAKE_DOCKER_RUNNING_FILE"
: >"$FAKE_DOCKER_LOG"
export FAKE_DOCKER_DESIRED=paused
"${repository_root}/scripts/reconcile-clamav.sh"
[[ "$(<"$FAKE_DOCKER_RUNNING_FILE")" == "no" ]] || fail_test "pause did not stop ClamAV"
assert_log_contains "stop --timeout 45 clamav"
assert_log_contains "--profile antivirus"
assert_log_contains "file_scanner_observed_state = 'STOPPED'"

printf '%s\n' "no" >"$FAKE_DOCKER_RUNNING_FILE"
: >"$FAKE_DOCKER_LOG"
export FAKE_DOCKER_DESIRED=running
export FAKE_DOCKER_HEALTH=healthy
"${repository_root}/scripts/reconcile-clamav.sh"
[[ "$(<"$FAKE_DOCKER_RUNNING_FILE")" == "yes" ]] || fail_test "resume did not start ClamAV"
assert_log_contains "up --detach --no-deps clamav"
assert_log_contains "file_scanner_observed_state = 'RUNNING'"

printf '%s\n' "reconcile-clamav tests passed"
