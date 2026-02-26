#!/bin/bash
set -e
cd "$(dirname "$0")"

[ -f .env ] && { set -a; source .env; set +a; }

trap 'kill 0' EXIT
(cd api && go run ./cmd/server) &
(cd ui && pnpm dev) &
wait
