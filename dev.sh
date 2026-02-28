#!/bin/bash
set -e
cd "$(dirname "$0")"

[ -f .env ] && { set -a; source .env; set +a; }
[ -n "$1" ] && {
  case "$1" in
    /*) export BENCH_CONFIG="$1" ;;
    *) export BENCH_CONFIG="$PWD/$1" ;;
  esac
}
[ -z "$BENCH_CONFIG" ] && [ -f config.yaml ] && export BENCH_CONFIG="$PWD/config.yaml"

trap 'kill 0' EXIT

if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1; then
  (docker compose up) &
  sleep 3
fi

(cd api && go run ./cmd/server) &
(cd ui && pnpm dev) &
wait
