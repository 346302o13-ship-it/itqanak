#!/usr/bin/env bash
# Host-side threshold check for the operational signals the admin monitoring page
# already computes. Nothing else watches these, so worker death, a dead-letter
# pile-up, a stalled outbox or unsendable auth e-mails are otherwise invisible
# until a customer complains. Sends one consolidated Telegram message when any
# threshold trips; silent when healthy.
set -euo pipefail
umask 077

script_path="${BASH_SOURCE[0]}"
script_dir="${script_path%/*}"
[[ "$script_dir" != "$script_path" ]] || script_dir="."

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fail() { log "monitor_alert_check_failed: $1"; exit 1; }

compose_file="${ITQANAK_COMPOSE_FILE:-/root/itqanak/compose.production.yaml}"
compose_env_file="${ITQANAK_COMPOSE_ENV_FILE:-/root/itqanak/.env.production}"
compose_project="${ITQANAK_COMPOSE_PROJECT_NAME:-itqanak}"
[[ -f "$compose_file" ]] || fail "invalid_compose_file"
[[ -f "$compose_env_file" ]] || fail "invalid_compose_env_file"
command -v docker >/dev/null 2>&1 || fail "docker_cli_missing"

# Tunable thresholds.
worker_stale_seconds="${ALERT_WORKER_STALE_SECONDS:-180}"
outbox_pending_max="${ALERT_OUTBOX_PENDING_MAX:-5000}"
outbox_oldest_pending_hours="${ALERT_OUTBOX_OLDEST_HOURS:-24}"
pending_scan_max="${ALERT_PENDING_SCAN_MAX:-50}"

psql_query() {
  docker compose --ansi never --env-file "$compose_env_file" \
    --project-name "$compose_project" --file "$compose_file" \
    exec -T postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --username=itqanak --dbname=itqanak --tuples-only --no-align --command "$1"
}

row="$(psql_query "
  SELECT
    COALESCE(EXTRACT(EPOCH FROM (now() - max(last_seen_at)))::bigint, 999999)
      FROM worker_heartbeats
  , (SELECT count(*) FROM outbox_events WHERE status IN ('PENDING','PROCESSING','RETRY'))
  , (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::bigint, 0)
      FROM outbox_events WHERE status IN ('PENDING','PROCESSING','RETRY'))
  , (SELECT count(*) FROM outbox_events WHERE status = 'DEAD_LETTER')
  , (SELECT count(*) FROM service_request_attachments
      WHERE storage_status = 'STORED' AND scan_status = 'PENDING_SCAN')
  , (SELECT count(*) FROM auth_email_outbox WHERE status = 'DEAD_LETTER')
" 2>/dev/null)" || fail "query_failed"

IFS='|' read -r worker_age outbox_pending outbox_oldest outbox_dead pending_scan auth_email_dead <<<"$row"

problems=()
(( worker_age > worker_stale_seconds )) \
  && problems+=("worker heartbeat is ${worker_age}s old (>${worker_stale_seconds}s)")
(( outbox_pending > outbox_pending_max )) \
  && problems+=("outbox has ${outbox_pending} pending events (>${outbox_pending_max})")
(( outbox_oldest > outbox_oldest_pending_hours * 3600 )) \
  && problems+=("oldest pending outbox event is $((outbox_oldest / 3600))h old")
(( outbox_dead > 0 )) \
  && problems+=("${outbox_dead} outbox events are DEAD_LETTER")
(( pending_scan > pending_scan_max )) \
  && problems+=("${pending_scan} attachments awaiting scan (>${pending_scan_max})")
(( auth_email_dead > 0 )) \
  && problems+=("${auth_email_dead} auth e-mails are DEAD_LETTER (users cannot finish sign-up)")

if (( ${#problems[@]} == 0 )); then
  log "monitor_alert_check_ok"
  exit 0
fi

message="ITQANAK monitoring:"
for problem in "${problems[@]}"; do
  message+=$'\n- '"$problem"
done
log "monitor_alert_check_tripped count=${#problems[@]}"
"${script_dir}/notify-telegram.sh" "$message"
