#!/bin/bash
# Test all flow step types against the running Bench API and Flowpipe server.
#
# Prerequisites:
#   - docker compose up -d postgres flowpipe  (or ./dev.sh)
#   - API running: cd api && go run ./cmd/server
#   - config.yaml with flows.path, petstore REST (for test_http), databases (for test_query)
#
# To regenerate .fp from JSON (after adding/editing flows): 
#   cd api && BENCH_CONFIG=../config.yaml go test -run TestSyncFromJSON ./internal/service/flow/... -count=1
#
# Usage: ./scripts/test-steps.sh [API_BASE_URL] [API_TOKEN]

set -e
cd "$(dirname "$0")/.."

API_BASE="${1:-${API_BASE_URL:-http://localhost:8080}}"
API_TOKEN="${2:-${API_TOKEN:-1234567890}}"
FLOWS_DIR="${FLOWS_DIR:-./flows}"

# Ensure API base has no trailing slash and includes /api
API_BASE="${API_BASE%/}"
[[ "$API_BASE" != *"/api" ]] && API_BASE="$API_BASE/api"

echo "=== Bench Flow Step Tests ==="
echo "API: $API_BASE"
echo "Flows dir: $FLOWS_DIR"
echo ""

# Pre-check: API reachable
if ! curl -sS --connect-timeout 3 -o /dev/null -H "X-API-Token: $API_TOKEN" "$API_BASE/health" 2>/dev/null; then
  echo "Warning: API may not be reachable at $API_BASE. Ensure ./dev.sh or the API server is running."
  echo ""
fi

# Register flows: create or update via API (generates .fp files)
register_flow() {
  local id="$1"
  local file="$FLOWS_DIR/$id.json"
  if [[ ! -f "$file" ]]; then
    echo "  Skip $id: $file not found"
    return 1
  fi
  echo -n "  Register $id... "
  local code
  code=$(curl -sS --connect-timeout 5 --max-time 30 -o /dev/null -w "%{http_code}" -X PUT "$API_BASE/flows/$id?module=." \
    -H "Content-Type: application/json" \
    -H "X-API-Token: $API_TOKEN" \
    -d @"$file")
  if [[ "$code" =~ ^(200|201)$ ]]; then
    echo "OK"
    return 0
  fi
  # Try create if update failed (flow may not exist)
  code=$(curl -sS --connect-timeout 5 --max-time 30 -o /dev/null -w "%{http_code}" -X POST "$API_BASE/flows?module=." \
    -H "Content-Type: application/json" \
    -H "X-API-Token: $API_TOKEN" \
    -d @"$file")
  if [[ "$code" =~ ^(200|201)$ ]]; then
    echo "OK (created)"
    return 0
  fi
  echo "FAILED (HTTP $code)"
  return 1
}

# Run a flow
run_flow() {
  local id="$1"
  local args="${2:-{}}"
  echo -n "  Run $id... "
  local out
  out=$(curl -sS --connect-timeout 5 --max-time 120 -X POST "$API_BASE/flows/$id/run?module=." \
    -H "Content-Type: application/json" \
    -H "X-API-Token: $API_TOKEN" \
    -d "{\"args\": $args}" 2>&1) || true
  if echo "$out" | grep -qE '"flowpipe"|"execution_id"|"output"'; then
    echo "OK"
    return 0
  else
    echo "FAILED"
    echo "$out" | head -20
    return 1
  fi
}

echo "--- Registering test flows ---"
for f in test_input_message test_sleep test_transform test_container test_query test_http test_pipeline test_http_caller; do
  register_flow "$f" || true
done

echo ""
echo "--- Running test flows ---"

echo "1. test_input_message (input + message)"
run_flow "test_input_message" '{"greeting": "Hi from test"}'

echo ""
echo "2. test_sleep (sleep + message)"
run_flow "test_sleep"

echo ""
echo "3. test_transform (transform + message)"
run_flow "test_transform"

echo ""
echo "4. test_container (container + message, requires Docker)"
run_flow "test_container"

echo ""
echo "5. test_query (query + message, requires DB)"
run_flow "test_query"

echo ""
echo "6. test_http (http + message, requires petstore REST)"
run_flow "test_http"

echo ""
echo "7. test_pipeline (pipeline -> test_sleep + message)"
run_flow "test_pipeline"

echo ""
echo "8. test_http_caller (pipeline -> test_http, transform output, return)"
run_flow "test_http_caller"

echo ""
echo "=== Done ==="
