#!/bin/sh
# Worker health: process must be alive and heartbeat file must be fresh.
# Written by WorkerHeartbeatService after successful dependency probes.
set -eu

HEARTBEAT_PATH="${WORKER_HEARTBEAT_PATH:-/tmp/fap-worker-heartbeat}"
MAX_AGE_SECONDS="${WORKER_HEARTBEAT_MAX_AGE_SECONDS:-30}"

if [ ! -f "$HEARTBEAT_PATH" ]; then
  echo "worker heartbeat file missing: $HEARTBEAT_PATH" >&2
  exit 1
fi

# BusyBox `date -r` works on Alpine; fall back to parsing JSON ts if needed.
mtime=$(date -r "$HEARTBEAT_PATH" +%s 2>/dev/null || true)
if [ -z "$mtime" ]; then
  ts=$(sed -n 's/.*"ts"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$HEARTBEAT_PATH" | head -n1)
  if [ -z "$ts" ]; then
    echo "unable to read heartbeat timestamp" >&2
    exit 1
  fi
  # ts may be milliseconds
  case "$ts" in
    ???????????????) mtime=$((ts / 1000)) ;;
    *) mtime=$ts ;;
  esac
fi

now=$(date +%s)
age=$((now - mtime))
if [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
  echo "worker heartbeat stale: age=${age}s max=${MAX_AGE_SECONDS}s" >&2
  exit 1
fi

exit 0
