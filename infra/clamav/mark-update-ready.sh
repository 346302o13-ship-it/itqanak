#!/bin/sh
set -eu

marker=/tmp/itqanak-clamav/restart-required
: >"$marker"
chmod 0600 "$marker"
