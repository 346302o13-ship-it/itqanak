#!/usr/bin/env bash
# Minimal Telegram alert sender. Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
# from the environment (systemd EnvironmentFile). Never echoes the token.
#
#   notify-telegram.sh "message text"
#   systemd:  OnFailure=itqanak-alert@%n.service  ->  itqanak-alert@.service
set -euo pipefail

token="${TELEGRAM_BOT_TOKEN:-}"
chat="${TELEGRAM_CHAT_ID:-}"
text="${1:-ITQANAK alert (no message supplied)}"
host="$(hostname -s 2>/dev/null || echo unknown)"

if [[ -z "$token" || -z "$chat" ]]; then
  printf 'notify-telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set; message was: %s\n' "$text" >&2
  exit 0
fi

curl --silent --show-error --fail --max-time 15 \
  --data-urlencode "chat_id=${chat}" \
  --data-urlencode "text=[${host}] ${text}" \
  --data "disable_web_page_preview=true" \
  "https://api.telegram.org/bot${token}/sendMessage" >/dev/null \
  || { printf 'notify-telegram: send failed\n' >&2; exit 1; }
