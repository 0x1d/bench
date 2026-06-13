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

# Local dev defaults (host-run API/UI → dockerized infra on published ports)
export BENCH_FLOWPIPE_URL="${BENCH_FLOWPIPE_URL:-http://localhost:7103}"
export BENCH_AGENT_URL="${BENCH_AGENT_URL:-http://localhost:3001}"
export BENCH_DB_MAIN_URL="${BENCH_DB_MAIN_URL:-postgresql://bench:bench@localhost:5431/bench}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:8081}"
export BENCH_LISTEN_ADDR="${BENCH_LISTEN_ADDR:-:8081}"


trap 'kill 0' EXIT

if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1; then
  # Infrastructure only — API and UI run locally below (use: docker compose --profile docker up)
  (docker compose up postgres flowpipe agent) &
  sleep 3
fi

(cd api && go run ./cmd/server) &
(
  cd ui
  if [ ! -d node_modules/.bin ]; then
    CI=true pnpm install --frozen-lockfile
  fi
  CI=true exec pnpm dev
) &
wait
