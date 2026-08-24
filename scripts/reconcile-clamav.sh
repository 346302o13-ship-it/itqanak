#!/usr/bin/env bash
set -euo pipefail
umask 077

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "clamav_reconcile_failed code=$1"
  exit 1
}

compose_file="${ITQANAK_COMPOSE_FILE:-/srv/itqanak/compose.production.yaml}"
compose_env_file="${ITQANAK_COMPOSE_ENV_FILE:-/etc/itqanak/production.env}"
compose_project="${ITQANAK_COMPOSE_PROJECT_NAME:-itqanak}"
timeout_seconds="${CLAMAV_RECONCILE_TIMEOUT_SECONDS:-300}"
poll_seconds="${CLAMAV_RECONCILE_POLL_SECONDS:-3}"

[[ "$compose_file" == /* && -f "$compose_file" ]] || fail "invalid_compose_file"
[[ "$compose_env_file" == /* && -f "$compose_env_file" ]] || fail "invalid_compose_env_file"
[[ "$compose_project" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]] || fail "invalid_compose_project"
[[ "$timeout_seconds" =~ ^[0-9]+$ ]] || fail "invalid_timeout"
[[ "$poll_seconds" =~ ^[0-9]+$ ]] || fail "invalid_poll_interval"
(( timeout_seconds >= 30 && timeout_seconds <= 900 )) || fail "invalid_timeout"
(( poll_seconds >= 1 && poll_seconds <= 10 )) || fail "invalid_poll_interval"
command -v docker >/dev/null 2>&1 || fail "docker_cli_missing"

compose=(
  docker compose
  --ansi never
  --profile antivirus
  --env-file "$compose_env_file"
  --project-name "$compose_project"
  --file "$compose_file"
)

database_command() {
  local sql="$1"
  "${compose[@]}" exec -T postgres \
    psql --no-psqlrc --set=ON_ERROR_STOP=1 --username=itqanak --dbname=itqanak \
      --tuples-only --no-align --command "$sql"
}

desired_pause_state() {
  local result
  result="$(database_command \
    "SELECT CASE WHEN file_scan_queue_paused THEN 'paused' ELSE 'running' END
     FROM platform_operational_settings
     WHERE singleton_key = 'platform';")" || fail "state_read_failed"
  result="${result//$'\r'/}"
  result="${result//$'\n'/}"
  case "$result" in
    paused | running) printf '%s' "$result" ;;
    *) fail "state_missing" ;;
  esac
}

record_observation() {
  local state="$1"
  local detail="$2"
  case "$state" in
    UNKNOWN | STARTING | RUNNING | STOPPED | ERROR) ;;
    *) fail "invalid_observed_state" ;;
  esac
  [[ "$detail" =~ ^[a-z][a-z0-9_]{0,79}$ ]] || fail "invalid_observed_detail"

  "${compose[@]}" exec -T postgres \
    psql --no-psqlrc --set=ON_ERROR_STOP=1 --username=itqanak --dbname=itqanak \
      --command \
      "UPDATE platform_operational_settings
       SET file_scanner_observed_state = '$state',
           file_scanner_observed_at = now(),
           file_scanner_observed_detail = '$detail'
       WHERE singleton_key = 'platform'
         AND ROW(file_scanner_observed_state, file_scanner_observed_detail)
             IS DISTINCT FROM ROW('$state', '$detail');" \
      >/dev/null
}

stop_scanner() {
  local running_container
  running_container="$("${compose[@]}" ps --quiet --status running clamav)" || {
    record_observation ERROR inspect_failed || true
    fail "inspect_failed"
  }
  if [[ -z "$running_container" ]]; then
    record_observation STOPPED desired_paused
    return
  fi
  if ! "${compose[@]}" stop --timeout 45 clamav >/dev/null; then
    record_observation ERROR stop_failed || true
    fail "stop_failed"
  fi
  running_container="$("${compose[@]}" ps --quiet --status running clamav)" || {
    record_observation ERROR inspect_failed || true
    fail "inspect_failed"
  }
  if [[ -n "$running_container" ]]; then
    record_observation ERROR stop_incomplete || true
    fail "stop_incomplete"
  fi
  record_observation STOPPED desired_paused
}

start_scanner() {
  local container_id
  container_id="$("${compose[@]}" ps --quiet --status running clamav)" || {
    record_observation ERROR inspect_failed || true
    fail "inspect_failed"
  }
  if [[ -z "$container_id" ]]; then
    record_observation STARTING desired_running
    if ! "${compose[@]}" up --detach --no-deps clamav >/dev/null; then
      record_observation ERROR start_failed || true
      fail "start_failed"
    fi
    container_id="$("${compose[@]}" ps --quiet clamav)" || {
      record_observation ERROR inspect_failed || true
      fail "inspect_failed"
    }
  fi
  [[ "$container_id" =~ ^[0-9a-f]{12,64}$ ]] || {
    record_observation ERROR container_missing || true
    fail "container_missing"
  }

  local deadline=$((SECONDS + timeout_seconds))
  local starting_recorded=false
  while (( SECONDS < deadline )); do
    if [[ "$(desired_pause_state)" == "paused" ]]; then
      stop_scanner
      return
    fi

    local health
    health="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id")" || {
      record_observation ERROR inspect_failed || true
      fail "inspect_failed"
    }
    case "$health" in
      healthy)
        record_observation RUNNING healthy
        return
        ;;
      unhealthy | exited | dead)
        record_observation ERROR "container_${health}"
        fail "container_${health}"
        ;;
      starting | running | created | restarting)
        if [[ "$starting_recorded" == false ]]; then
          record_observation STARTING desired_running
          starting_recorded=true
        fi
        ;;
      *)
        record_observation ERROR unexpected_container_state
        fail "unexpected_container_state"
        ;;
    esac
    sleep "$poll_seconds"
  done

  record_observation ERROR readiness_timeout
  fail "readiness_timeout"
}

case "$(desired_pause_state)" in
  paused) stop_scanner ;;
  running) start_scanner ;;
esac
