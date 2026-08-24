#!/bin/sh
set -eu

runtime_dir="/tmp/itqanak-clamav"
clamd_config="${runtime_dir}/clamd.conf"
freshclam_config="${runtime_dir}/freshclam.conf"
initial_config="${runtime_dir}/freshclam-initial.conf"
restart_marker="${runtime_dir}/restart-required"
clamd_pid=""
freshclam_pid=""

stop_children() {
  if [ -n "$freshclam_pid" ]; then
    kill "$freshclam_pid" 2>/dev/null || true
  fi
  if [ -n "$clamd_pid" ]; then
    kill "$clamd_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap 'stop_children; exit 0' INT TERM

umask 077
mkdir -p "$runtime_dir"
chmod 0700 "$runtime_dir"

# Loading two complete signature databases at once exceeded the production
# memory boundary. Disable in-process reloads: a completed freshclam update
# marks this supervised container for a clean restart instead.
sed -e '/^[#[:space:]]*ConcurrentDatabaseReload[[:space:]]/d' \
  -e '/^[#[:space:]]*SelfCheck[[:space:]]/d' \
  /etc/clamav/clamd.conf >"$clamd_config"
printf '\nConcurrentDatabaseReload no\nSelfCheck 0\n' >>"$clamd_config"
sed -e 's|^\(NotifyClamd \)|#\1|' \
  -e '/^[#[:space:]]*OnUpdateExecute[[:space:]]/d' \
  -e '/^[#[:space:]]*TestDatabases[[:space:]]/d' \
  /etc/clamav/freshclam.conf >"$freshclam_config"
# CVD signatures and hashes are still verified by freshclam, then clamd loads
# the update itself. Running the optional second full database-load test beside
# clamd exceeded the bounded service memory before every ordinary reload.
printf '\nTestDatabases no\nOnUpdateExecute /usr/local/bin/itqanak-clamav-mark-update\n' \
  >>"$freshclam_config"

if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ]; then
  sed -e 's|^\(NotifyClamd \)|#\1|' \
    "$freshclam_config" >"$initial_config"
  freshclam --foreground --stdout --config-file="$initial_config"
fi
rm -f "$restart_marker"

rm -f /tmp/clamd.sock
clamd --foreground --config-file="$clamd_config" &
clamd_pid="$!"

startup_timeout="${CLAMD_STARTUP_TIMEOUT:-300}"
elapsed=0
while [ ! -S /tmp/clamd.sock ]; do
  if ! kill -0 "$clamd_pid" 2>/dev/null; then
    echo "clamav_startup_failed: clamd exited before becoming ready" >&2
    wait "$clamd_pid" || true
    exit 1
  fi
  if [ "$elapsed" -ge "$startup_timeout" ]; then
    echo "clamav_startup_failed: clamd readiness timed out" >&2
    stop_children
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

freshclam --checks="${FRESHCLAM_CHECKS:-1}" --daemon --foreground --stdout \
  --user=clamav --config-file="$freshclam_config" &
freshclam_pid="$!"

# The official image's default init tails forever after starting both daemons.
# This supervisor instead exits whenever either critical child dies, allowing
# Docker's restart policy to recover the complete service.
while :; do
  if ! kill -0 "$clamd_pid" 2>/dev/null; then
    echo "clamav_runtime_failed: clamd exited" >&2
    stop_children
    exit 1
  fi
  if ! kill -0 "$freshclam_pid" 2>/dev/null; then
    echo "clamav_runtime_failed: freshclam exited" >&2
    stop_children
    exit 1
  fi
  if [ -f "$restart_marker" ]; then
    echo "clamav_database_updated: restarting clamd with the new signatures" >&2
    stop_children
    exit 75
  fi
  sleep 5
done
