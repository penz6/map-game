#!/bin/sh
set -eu
umask 077
: "${DATA_DIR:=/data}"
export DATA_DIR
if [ "${1:-}" = node ] && [ "${2:-}" = server.mjs ]; then
  # flock is kernel-owned and works across container PID namespaces. Only after
  # acquiring it may a container discard a stale native PID lock after a crash.
  exec flock --exclusive --nonblock --no-fork "$DATA_DIR/.container.lock" \
    sh -c 'rm -f "$DATA_DIR/server.lock"; exec "$@"' historia "$@"
fi
exec "$@"
